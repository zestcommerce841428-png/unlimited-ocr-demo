import subprocess
import sys

# transformers==4.57.1 requires huggingface-hub<1.0, while the gradio SDK
# requires huggingface-hub>=1.2.0 -> real build-time ResolutionImpossible if
# transformers is pinned in requirements.txt. Worse, transformers actively
# refuses to import against a too-new huggingface-hub at *runtime*
# (dependency_versions_check.py), so installing it with --no-deps isn't
# enough either. Install it here instead, deps included, so pip downgrades
# huggingface-hub to what transformers needs. Safe because this runs before
# `gradio` is imported anywhere in this process — gradio doesn't self-check
# its huggingface-hub version at import time, so the downgrade doesn't break
# it (this mirrors the model's own official Space demo).
subprocess.run(
    [sys.executable, "-m", "pip", "install", "--quiet", "transformers==4.57.1"],
    check=True,
)

import glob
import os
import queue
import shutil
import tempfile
import threading

import spaces  # noqa: E402  (must precede torch / transformers imports)
import torch
from transformers import AutoModel, AutoTokenizer

import gradio as gr

MODEL_NAME = "baidu/Unlimited-OCR"
EXAMPLES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "examples")

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
print("Loading model...")
model = (
    AutoModel.from_pretrained(
        MODEL_NAME,
        trust_remote_code=True,
        use_safetensors=True,
        torch_dtype=torch.bfloat16,
    )
    .eval()
    .cuda()
)
print("Model ready.")

MODES = {
    "Gundam — fast": dict(base_size=1024, image_size=640, crop_mode=True),
    "Base — accurate": dict(base_size=1024, image_size=1024, crop_mode=False),
}
MODE_INFO = "Applies to single-page results. Gundam crops the page into tiles for speed; Base processes the full page for the highest fidelity."

PROMPT_PRESETS = {
    "Document parsing": "document parsing.",
    "Free OCR": "Free OCR.",
    "Parse the figure": "Parse the figure.",
    "Layout grounding": "<|grounding|>Given the layout of the image. ",
}

MAX_DEMO_PAGES = 4  # keep multi-page runs inside a shared ZeroGPU quota

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"}
OFFICE_EXTS = {".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".odp", ".ods", ".rtf", ".txt", ".csv"}
PDF_EXT = ".pdf"

SUPPORTED_FILE_TYPES = [
    "image",
    PDF_EXT,
    *sorted(OFFICE_EXTS),
]


# ── File → page-image conversion ────────────────────────────────────────────────

def _pdf_to_images(pdf_path: str, dpi: int = 200, max_pages: int = MAX_DEMO_PAGES):
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    tmp_dir = tempfile.mkdtemp(prefix="pdf_ocr_")
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    paths = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        out = os.path.join(tmp_dir, f"page_{i + 1:04d}.png")
        page.get_pixmap(matrix=mat).save(out)
        paths.append(out)
    doc.close()
    return paths


def _office_to_pdf(path: str) -> str:
    """Converts an Office/text document to PDF with headless LibreOffice."""
    if shutil.which("soffice") is None:
        raise gr.Error(
            "This file type needs LibreOffice for conversion, which isn't installed on this Space."
        )
    out_dir = tempfile.mkdtemp(prefix="office2pdf_")
    try:
        subprocess.run(
            ["soffice", "--headless", "--norestore", "--convert-to", "pdf", "--outdir", out_dir, path],
            check=True,
            timeout=180,
            capture_output=True,
        )
    except subprocess.CalledProcessError as exc:
        raise gr.Error(f"Could not convert that file to PDF: {exc}")
    except subprocess.TimeoutExpired:
        raise gr.Error("Converting that file to PDF took too long.")

    stem = os.path.splitext(os.path.basename(path))[0]
    pdf_path = os.path.join(out_dir, f"{stem}.pdf")
    if not os.path.exists(pdf_path):
        raise gr.Error("Could not convert that file to PDF for parsing.")
    return pdf_path


def _file_to_pages(path: str, max_pages: int = MAX_DEMO_PAGES):
    """Turns any supported upload into a list of page-image paths."""
    ext = os.path.splitext(path)[1].lower()
    if ext in IMAGE_EXTS:
        return [path]
    if ext == PDF_EXT:
        return _pdf_to_images(path, max_pages=max_pages)
    if ext in OFFICE_EXTS:
        return _pdf_to_images(_office_to_pdf(path), max_pages=max_pages)
    raise gr.Error(
        f"Unsupported file type '{ext or '(none)'}'. Supported: images, PDF, "
        "and Office documents (Word/PowerPoint/Excel/text)."
    )


# ── Inference helpers ─────────────────────────────────────────────────────────

def _read_result_text(out_dir: str) -> str:
    md_path = os.path.join(out_dir, "result.md")
    if os.path.exists(md_path):
        with open(md_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    return ""


def _collect_boxes_images(out_dir: str):
    single = os.path.join(out_dir, "result_with_boxes.jpg")
    if os.path.exists(single):
        return [single]
    return sorted(glob.glob(os.path.join(out_dir, "result_with_boxes_*.jpg")))


class _StreamTap:
    """Mirrors stdout to a queue, but only lines written by `target_thread`.

    Unlimited-OCR's TextStreamer prints generated tokens straight to stdout
    (transformers.TextStreamer.on_finalized_text) instead of returning an
    iterator, so this is the only way to stream partial output to the UI.
    """

    def __init__(self, target_thread: threading.Thread, sink: "queue.Queue[str]", real_stdout):
        self.target_thread = target_thread
        self.sink = sink
        self.real_stdout = real_stdout

    def write(self, data: str) -> int:
        self.real_stdout.write(data)
        if data and threading.current_thread() is self.target_thread and "[tps]" not in data.lower():
            self.sink.put(data)
        return len(data)

    def flush(self):
        self.real_stdout.flush()


def _run_streaming(target_fn, **kwargs):
    """Runs `target_fn(tokenizer, **kwargs)` in a thread, yielding accumulated stdout text."""
    chunks: "queue.Queue[str]" = queue.Queue()
    errors = []

    def _worker():
        try:
            target_fn(tokenizer, **kwargs)
        except Exception as exc:
            errors.append(exc)

    thread = threading.Thread(target=_worker, daemon=True)
    real_stdout = sys.stdout
    sys.stdout = _StreamTap(thread, chunks, real_stdout)

    accumulated = ""
    try:
        thread.start()
        while thread.is_alive() or not chunks.empty():
            try:
                piece = chunks.get(timeout=0.05)
            except queue.Empty:
                continue
            accumulated += piece
            yield accumulated
    finally:
        sys.stdout = real_stdout
        thread.join()

    if errors:
        raise gr.Error(f"Inference failed: {errors[0]}")
    yield accumulated


def _document_duration(file, mode_label, prompt_preset, custom_prompt):
    # ZeroGPU appears to apply its own safety margin on top of whatever is
    # returned here before checking it against the visitor's tier cap (a
    # 280s return was rejected as "420s" — a suspiciously exact 1.5x), so
    # these are kept well under the free-tier per-call ceiling.
    if not file:
        return 60
    ext = os.path.splitext(file)[1].lower()
    if ext in IMAGE_EXTS:
        return 60 if mode_label.startswith("Gundam") else 120
    return 150  # PDF / Office: conversion + up to MAX_DEMO_PAGES pages


@spaces.GPU(duration=_document_duration)
def run_document(file, mode_label, prompt_preset, custom_prompt):
    """Parse an uploaded document (image, PDF, or Office file) with Unlimited-OCR."""
    if not file:
        raise gr.Error("Upload a file first.")

    pages = _file_to_pages(file)
    if not pages:
        raise gr.Error("Could not read any pages from that file.")

    prompt = (custom_prompt or "").strip()
    out_dir = tempfile.mkdtemp(prefix="ocr_out_")

    if len(pages) == 1:
        prompt = prompt or PROMPT_PRESETS[prompt_preset]
        infer_kwargs = dict(
            prompt=f"<image>{prompt}",
            image_file=pages[0],
            output_path=out_dir,
            max_length=8192,
            no_repeat_ngram_size=35,
            ngram_window=128,
            save_results=True,
            **MODES[mode_label],
        )
        target_fn = model.infer
    else:
        if not prompt:
            prompt = "Multi page parsing." if prompt_preset == "Document parsing" else PROMPT_PRESETS[prompt_preset]
        infer_kwargs = dict(
            prompt=f"<image>{prompt}",
            image_files=pages,
            output_path=out_dir,
            image_size=1024,
            max_length=6144,
            no_repeat_ngram_size=35,
            ngram_window=512,
            save_results=True,
        )
        target_fn = model.infer_multi

    final_text = ""
    for accumulated in _run_streaming(target_fn, **infer_kwargs):
        final_text = accumulated
        yield accumulated, accumulated, None

    text = _read_result_text(out_dir) or final_text
    boxes = _collect_boxes_images(out_dir)
    yield text, text, (boxes or None)


# ── UI ─────────────────────────────────────────────────────────────────────────

THEME = gr.themes.Soft(
    primary_hue=gr.themes.colors.blue,
    secondary_hue=gr.themes.colors.indigo,
    neutral_hue=gr.themes.colors.slate,
    font=[gr.themes.GoogleFont("Inter"), "ui-sans-serif", "system-ui", "sans-serif"],
    font_mono=[gr.themes.GoogleFont("JetBrains Mono"), "ui-monospace", "monospace"],
).set(
    button_primary_background_fill="*primary_600",
    button_primary_background_fill_hover="*primary_700",
    block_shadow="0 1px 3px rgba(0,0,0,0.06)",
    block_radius="16px",
)

CSS = """
.gradio-container {max-width: 1180px !important; margin: 0 auto !important;}
#hero {text-align: center; padding: 8px 0 4px 0;}
#hero h1 {font-size: 1.9rem; margin-bottom: 0.25rem;}
#hero p {color: var(--body-text-color-subdued); font-size: 1.02rem; margin-top: 0;}
#badges {display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin: 10px 0 4px 0;}
#badges a {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 12px; border-radius: 999px; font-size: 0.82rem; font-weight: 500;
    text-decoration: none; border: 1px solid var(--border-color-primary);
    color: var(--body-text-color); background: var(--background-fill-secondary);
}
#badges a:hover {background: var(--background-fill-primary); border-color: var(--primary-500);}
#footer {text-align: center; color: var(--body-text-color-subdued); font-size: 0.85rem; margin-top: 18px;}
#footer a {color: var(--primary-600);}
.result-panel textarea, .result-panel .prose {font-size: 0.92rem;}
"""

HERO_HTML = f"""
<div id="hero">
  <h1>🔎 Unlimited-OCR</h1>
  <p>One-shot, long-horizon document parsing — powered by
  <a href="https://huggingface.co/{MODEL_NAME}" target="_blank">{MODEL_NAME}</a></p>
</div>
<div id="badges">
  <a href="https://huggingface.co/{MODEL_NAME}" target="_blank">🤗 Model card</a>
  <a href="https://github.com/baidu/Unlimited-OCR" target="_blank">⚙️ GitHub</a>
  <a href="https://arxiv.org/abs/2606.23050" target="_blank">📄 Paper</a>
  <a href="https://huggingface.co/{MODEL_NAME}/blob/main/LICENSE" target="_blank">⚖️ MIT License</a>
</div>
"""

FOOTER_HTML = f"""
<div id="footer">
  Built with 🤗 <a href="https://gradio.app" target="_blank">Gradio</a> on
  <a href="https://huggingface.co/spaces" target="_blank">Hugging Face Spaces</a> · Runs on ZeroGPU ·
  Model by <a href="https://huggingface.co/baidu" target="_blank">Baidu</a>, released under MIT.
</div>
"""

EXAMPLES_SINGLE = [
    [os.path.join(EXAMPLES_DIR, "invoice.png"), "Gundam — fast", "Document parsing"],
    [os.path.join(EXAMPLES_DIR, "report.png"), "Base — accurate", "Document parsing"],
    [os.path.join(EXAMPLES_DIR, "invoice.png"), "Gundam — fast", "Layout grounding"],
]

with gr.Blocks(title="Unlimited-OCR Demo") as demo:
    gr.HTML(HERO_HTML)
    gr.Markdown(
        f"Upload an **image** (JPG/PNG/WEBP/BMP/TIFF/GIF), a **PDF**, or an **Office "
        "document** (Word/PowerPoint/Excel/text/RTF/CSV) — Office files and PDFs are "
        f"parsed page-by-page, capped at the first **{MAX_DEMO_PAGES} pages** to keep "
        "runs inside a shared ZeroGPU quota."
    )

    with gr.Row(equal_height=False):
        with gr.Column(scale=4):
            with gr.Group():
                file_input = gr.File(
                    label="Document",
                    file_types=SUPPORTED_FILE_TYPES,
                    type="filepath",
                )
                with gr.Row():
                    mode = gr.Radio(
                        list(MODES.keys()),
                        value="Gundam — fast",
                        label="Mode",
                        info=MODE_INFO,
                    )
                prompt_preset = gr.Dropdown(
                    list(PROMPT_PRESETS.keys()),
                    value="Document parsing",
                    label="Task",
                    info="Pick a preset, or write your own prompt below.",
                )
                with gr.Accordion("Custom prompt (optional)", open=False):
                    custom_prompt = gr.Textbox(
                        label="Custom prompt",
                        placeholder="e.g. Extract the table as markdown.",
                        show_label=False,
                    )
            run_btn = gr.Button("▶  Run OCR", variant="primary", size="lg")
            gr.Examples(
                examples=EXAMPLES_SINGLE,
                inputs=[file_input, mode, prompt_preset],
                label="Try an example",
                cache_examples=False,
            )

        with gr.Column(scale=5):
            with gr.Group(elem_classes=["result-panel"]):
                with gr.Tabs():
                    with gr.Tab("Rendered"):
                        output_md = gr.Markdown(
                            value="*Results will appear here once you run OCR.*",
                            min_height=280,
                        )
                    with gr.Tab("Raw text"):
                        output_raw = gr.Textbox(
                            show_label=False,
                            lines=14,
                            max_lines=30,
                            buttons=["copy"],
                        )
                with gr.Accordion("🗺️ Layout grounding (detected regions)", open=False):
                    output_boxes = gr.Gallery(
                        show_label=False,
                        columns=2,
                        object_fit="contain",
                        height=280,
                    )
            gr.Markdown(
                "💡 **Tips**\n"
                "- **Gundam** mode is fastest for single- or dual-column pages.\n"
                "- **Base** mode helps on dense multi-column layouts or small text.\n"
                "- Pick **Layout grounding** as the task to see detected regions "
                "drawn on the page.\n"
                "- PDFs/Office files with more than one resulting page always use "
                "multi-page parsing, regardless of Mode."
            )

    run_btn.click(
        run_document,
        inputs=[file_input, mode, prompt_preset, custom_prompt],
        outputs=[output_md, output_raw, output_boxes],
    )

    gr.HTML(FOOTER_HTML)

demo.queue().launch(theme=THEME, css=CSS, mcp_server=True)
