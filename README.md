# 🔎 Unlimited-OCR Demo

A polished [Gradio](https://gradio.app) demo for
[**baidu/Unlimited-OCR**](https://huggingface.co/baidu/Unlimited-OCR) — one-shot,
long-horizon document parsing to Markdown, with layout grounding boxes. Deployed on
[Hugging Face Spaces](https://huggingface.co/spaces) with ZeroGPU.

[![Hugging Face Space](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Live%20Demo-ffc107)](https://huggingface.co/spaces/zestcommerce841428/unlimited-ocr-demo)
[![Model](https://img.shields.io/badge/%F0%9F%A4%97%20Model-baidu%2FUnlimited--OCR-blue)](https://huggingface.co/baidu/Unlimited-OCR)
[![Paper](https://img.shields.io/badge/arXiv-2606.23050-b31b1b)](https://arxiv.org/abs/2606.23050)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

▶ **[Try it live](https://huggingface.co/spaces/zestcommerce841428/unlimited-ocr-demo)**

## Features

- **Upload almost anything** — images (JPG/PNG/WEBP/BMP/TIFF/GIF), PDFs, and Office
  documents (Word/PowerPoint/Excel/RTF/text/CSV, converted to PDF with headless
  LibreOffice) all go through one uploader
- **Automatic single- vs. multi-page routing** — a single resulting page uses
  `model.infer(...)`; a PDF/Office file that expands to more than one page
  automatically uses `model.infer_multi(...)`, capped at the first few pages to
  keep runs inside a shared ZeroGPU quota
- **Two speed/accuracy modes** — *Gundam* (crops the page, fast) and *Base* (full page, most accurate)
- **Task presets** — document parsing, free OCR, figure parsing, and layout grounding, or write your own prompt
- **Layout grounding** — view detected regions drawn directly on the page (a gallery for multi-page results)
- **Streaming output** — tokens render into the UI as the model generates them
- **Example gallery** — try it instantly with two bundled synthetic sample documents

## Screenshot

<p align="center">
  <img src="examples/invoice.png" width="45%" alt="Sample invoice input" />
</p>

## Quickstart

Requires a CUDA GPU (the app loads the model in `bfloat16` and calls `.cuda()` at
startup — see [Running without a GPU](#running-without-a-gpu) if you don't have one).

```bash
git clone https://github.com/zestcommerce841428-png/unlimited-ocr-demo.git
cd unlimited-ocr-demo
pip install -r requirements.txt
python app.py
```

The app will be available at `http://127.0.0.1:7860`.

Parsing Office documents (`.docx`, `.pptx`, `.xlsx`, `.rtf`, `.txt`, `.csv`) also
requires `soffice` (LibreOffice) on `PATH` for the headless doc-to-PDF conversion —
see `packages.txt` for what's installed on the Space. Images and PDFs work without it.

> **Note:** `transformers==4.57.1` is intentionally installed at runtime inside
> `app.py` rather than pinned in `requirements.txt` — see the comment at the top of
> the file for why (a real version conflict between what `transformers` and the
> Gradio SDK each require from `huggingface-hub`).

### Running without a GPU

The model requires CUDA. To develop the UI without a GPU, install the
[`spaces`](https://pypi.org/project/spaces/) package and deploy to a
[ZeroGPU Space](https://huggingface.co/docs/hub/spaces-zerogpu) instead — `@spaces.GPU`
lets the model load on a CPU-only machine and defers real execution to an
on-demand GPU worker. This is exactly how the [live demo](https://huggingface.co/spaces/zestcommerce841428/unlimited-ocr-demo) is deployed.

## Project structure

```
.
├── app.py            # Gradio app: UI, streaming inference, file-type routing
├── requirements.txt  # Build-time Python dependencies (transformers installed at runtime)
├── packages.txt      # Build-time apt dependency: libreoffice (Office → PDF conversion)
├── examples/          # Synthetic sample documents used by the example gallery
├── LICENSE
└── README.md
```

## How it works

- **Model loading** — `AutoModel.from_pretrained("baidu/Unlimited-OCR", trust_remote_code=True)`
  at module scope, per the [ZeroGPU pattern](https://huggingface.co/docs/hub/spaces-zerogpu):
  eager `.cuda()` load so weights are ready to stream into a GPU worker on first request.
- **Streaming** — Unlimited-OCR's `TextStreamer` prints generated tokens straight to
  `stdout` rather than exposing an iterator, so `app.py` runs inference in a background
  thread and taps `stdout` to stream partial output into the Gradio UI.
- **File-type routing** — images are used directly; PDFs are rasterized to page images
  with PyMuPDF; Office/text documents are first converted to PDF with headless
  LibreOffice (`soffice --headless --convert-to pdf`), then rasterized the same way.
  A single resulting page uses `model.infer(...)`; more than one uses
  `model.infer_multi(...)` — both documented in the
  [model card](https://huggingface.co/baidu/Unlimited-OCR).

## Deploying your own copy

1. Create a new [Gradio Space](https://huggingface.co/new-space) (ZeroGPU hardware
   recommended — requires a PRO/Team/Enterprise plan, or request a free
   [community GPU grant](https://huggingface.co/docs/hub/spaces-zerogpu) on a non-PRO account).
2. Push this repo's files to it:
   ```bash
   hf upload <your-username>/<space-name> . --repo-type space
   ```
3. Add Spaces config frontmatter to the top of `README.md` in that Space
   (`sdk: gradio`, `app_file: app.py`, etc. — see the
   [Spaces config reference](https://huggingface.co/docs/hub/spaces-config-reference)).

## Credits

- Model: [baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR) by Baidu,
  [paper](https://arxiv.org/abs/2606.23050), [GitHub](https://github.com/baidu/Unlimited-OCR) — MIT licensed
- Demo app: built with [Gradio](https://gradio.app) on [Hugging Face Spaces](https://huggingface.co/spaces)

## License

This demo's code is released under the [MIT License](LICENSE). The
Unlimited-OCR model itself is separately MIT licensed by Baidu — see its
[model card](https://huggingface.co/baidu/Unlimited-OCR) for details.
