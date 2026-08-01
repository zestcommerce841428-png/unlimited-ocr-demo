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

import base64
import glob
import os
import queue
import shutil
import tempfile
import threading
from typing import Iterator

import spaces  # noqa: E402  (must precede torch / transformers imports)
import torch
from transformers import AutoModel, AutoTokenizer

import gradio as gr
from gradio import Server
from gradio.data_classes import FileData
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

MODEL_NAME = "baidu/Unlimited-OCR"
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

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
    "gundam": dict(base_size=1024, image_size=640, crop_mode=True),
    "base": dict(base_size=1024, image_size=1024, crop_mode=False),
}

MAX_DEMO_PAGES = 4  # keep multi-page runs inside a shared ZeroGPU quota

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif", ".gif"}
OFFICE_EXTS = {".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".odp", ".ods", ".rtf", ".txt", ".csv"}
PDF_EXT = ".pdf"


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


def _collect_boxes_data_urls(out_dir: str):
    """Reads any result_with_boxes*.jpg files and inlines them as data URLs.

    Returning data URLs (rather than server-side paths) sidesteps Gradio's
    file-serving allowed-paths check entirely, since these images live in an
    ad-hoc tempdir outside the app's static/ directory.
    """
    single = os.path.join(out_dir, "result_with_boxes.jpg")
    paths = [single] if os.path.exists(single) else sorted(glob.glob(os.path.join(out_dir, "result_with_boxes_*.jpg")))
    urls = []
    for p in paths:
        with open(p, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        urls.append(f"data:image/jpeg;base64,{b64}")
    return urls


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


def _document_duration(path, mode, prompt):
    # ZeroGPU appears to apply its own safety margin on top of whatever is
    # returned here before checking it against the visitor's tier cap (a
    # 280s return was rejected as "420s" — a suspiciously exact 1.5x), so
    # these are kept well under the free-tier per-call ceiling.
    if not path:
        return 60
    ext = os.path.splitext(path)[1].lower()
    if ext in IMAGE_EXTS:
        return 60 if mode == "gundam" else 120
    return 150  # PDF / Office: conversion + up to MAX_DEMO_PAGES pages


@spaces.GPU(duration=_document_duration)
def _run_document_gpu(path: str, mode: str, prompt: str) -> Iterator[dict]:
    pages = _file_to_pages(path)
    if not pages:
        raise gr.Error("Could not read any pages from that file.")

    prompt = (prompt or "").strip()
    out_dir = tempfile.mkdtemp(prefix="ocr_out_")

    if len(pages) == 1:
        resolved_prompt = prompt or "document parsing."
        infer_kwargs = dict(
            prompt=f"<image>{resolved_prompt}",
            image_file=pages[0],
            output_path=out_dir,
            max_length=8192,
            no_repeat_ngram_size=35,
            ngram_window=128,
            save_results=True,
            **MODES.get(mode, MODES["gundam"]),
        )
        target_fn = model.infer
    else:
        resolved_prompt = prompt if prompt and prompt.lower() != "document parsing." else "Multi page parsing."
        infer_kwargs = dict(
            prompt=f"<image>{resolved_prompt}",
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
        yield {"text": accumulated, "boxes": []}

    text = _read_result_text(out_dir) or final_text
    yield {"text": text, "boxes": _collect_boxes_data_urls(out_dir)}


# ── Server: custom Next.js frontend + JSON/SSE API ──────────────────────────────

app = Server(title="Unlimited-OCR Demo")


@app.api(name="run_document", stream_every=0.15, time_limit=200)
def run_document_api(document: FileData, mode: str = "gundam", prompt: str = "") -> Iterator[dict]:
    """Parse an uploaded document (image, PDF, or Office file) with Unlimited-OCR.

    Args:
        document: the uploaded file — an image, PDF, or Office document.
        mode: 'gundam' (fast, crops the page) or 'base' (accurate, full page).
            Only affects single-page results.
        prompt: OCR instruction, e.g. 'document parsing.', 'Free OCR.', or a
            custom prompt. Empty defaults to document parsing.
    """
    path = document["path"] if isinstance(document, dict) else document
    yield from _run_document_gpu(path, mode, prompt)


# `@spaces.GPU` doesn't stack with `@app.api` on the same function, so
# `_run_document_gpu` (decorated above) does the GPU work and this thin
# wrapper is what's actually exposed as an endpoint — see gr.Server docs.

app.mount("/_next", StaticFiles(directory=os.path.join(STATIC_DIR, "_next")), name="next-assets")
app.mount("/examples", StaticFiles(directory=os.path.join(STATIC_DIR, "examples")), name="examples")


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(os.path.join(STATIC_DIR, "favicon.ico"))


@app.get("/", response_class=HTMLResponse)
async def homepage():
    with open(os.path.join(STATIC_DIR, "index.html"), "r", encoding="utf-8") as f:
        return f.read()


demo = app  # HF runtime expects `demo`
demo.launch()
