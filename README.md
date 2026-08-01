---
title: Unlimited OCR Demo
emoji: 🔎
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: 6.22.0
app_file: app.py
short_description: Document parsing demo for baidu/Unlimited-OCR
python_version: "3.12"
startup_duration_timeout: 30m
license: mit
---

# 🔎 Unlimited-OCR Demo

A custom [Next.js](https://nextjs.org) + [Tailwind CSS](https://tailwindcss.com) demo for
[**baidu/Unlimited-OCR**](https://huggingface.co/baidu/Unlimited-OCR) — one-shot,
long-horizon document parsing to Markdown, with layout grounding boxes. Deployed on
[Hugging Face Spaces](https://huggingface.co/spaces) with ZeroGPU.

[![Hugging Face Space](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Live%20Demo-ffc107)](https://huggingface.co/spaces/zestcommerce841428/unlimited-ocr-demo)
[![Model](https://img.shields.io/badge/%F0%9F%A4%97%20Model-baidu%2FUnlimited--OCR-blue)](https://huggingface.co/baidu/Unlimited-OCR)
[![Paper](https://img.shields.io/badge/arXiv-2606.23050-b31b1b)](https://arxiv.org/abs/2606.23050)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Deploy](https://github.com/zestcommerce841428-png/unlimited-ocr-demo/actions/workflows/deploy.yml/badge.svg)](https://github.com/zestcommerce841428-png/unlimited-ocr-demo/actions/workflows/deploy.yml)

▶ **[Try it live](https://huggingface.co/spaces/zestcommerce841428/unlimited-ocr-demo)**

## Features

- **Custom UI** — hand-built Next.js 16 + Tailwind CSS frontend (no Gradio UI), with a
  streaming result panel, tabs, a grounding-box gallery, and drag-and-drop upload
- **Upload almost anything** — images (JPG/PNG/WEBP/BMP/TIFF/GIF), PDFs, and Office
  documents (Word/PowerPoint/Excel/RTF/text/CSV, converted to PDF with headless
  LibreOffice) all go through one uploader
- **Automatic single- vs. multi-page routing** — a single resulting page uses
  `model.infer(...)`; a PDF/Office file that expands to more than one page
  automatically uses `model.infer_multi(...)`, capped at the first few pages to
  keep runs inside a shared ZeroGPU quota
- **Two speed/accuracy modes** — *Gundam* (crops the page, fast) and *Base* (full page, most accurate)
- **Layout grounding** — view detected regions drawn directly on the page (a gallery for multi-page results)
- **Token-by-token streaming**, delivered over Gradio's own streaming protocol via the
  official [`@gradio/client`](https://www.npmjs.com/package/@gradio/client) package
- **CI/CD** — GitHub Actions lints/builds the frontend and lints/syntax-checks the
  backend on every PR, then auto-deploys to the Space on push to `master`

## Architecture

```
Browser (Next.js static export)
   │  @gradio/client — Client.connect() + client.submit()
   ▼
gradio.Server (FastAPI)                 ← app.py, served from the same origin
   ├── /                 → static/index.html (Next.js build output)
   ├── /_next, /examples → static assets (StaticFiles mounts)
   └── /run_document     → @app.api + @spaces.GPU streaming endpoint
                              │
                              ▼
                     baidu/Unlimited-OCR on ZeroGPU
```

The frontend is statically exported (`next build` with `output: "export"`) — no
Node.js server runs in the Space. `app.py`'s only job at request time is serving
those static files and running inference; the Next.js *source* lives in this repo
for development, but only its **build output** is deployed.

`@spaces.GPU` and `@app.api` are stacked directly on the same function (matching the
model's own official reference Space) — splitting them across two functions, with the
`@app.api` one delegating via `yield from`, causes Gradio's schema introspection to
misreport the endpoint as non-streaming and silently drop every yielded chunk.

## Quickstart (frontend)

```bash
cd frontend
npm install
npm run dev
```

By default the dev server calls the **production** Space's API (same-origin logic
falls back to `window.location.origin`, which won't exist correctly under `next dev`).
Point it at a locally running backend instead by creating `frontend/.env.local`:

```
NEXT_PUBLIC_GRADIO_API_URL=http://127.0.0.1:7860
```

## Quickstart (backend)

Requires a CUDA GPU (the app loads the model in `bfloat16` and calls `.cuda()` at
startup) and, for Office-file support, `soffice` (LibreOffice) on `PATH` — see
`packages.txt`. To develop the UI without a GPU, deploy to a
[ZeroGPU Space](https://huggingface.co/docs/hub/spaces-zerogpu) instead: `@spaces.GPU`
lets the model load on a CPU-only machine and defers real execution to an on-demand
GPU worker, exactly how the [live demo](https://huggingface.co/spaces/zestcommerce841428/unlimited-ocr-demo) runs.

```bash
pip install -r requirements.txt
python app.py
```

> **Note:** `transformers==4.57.1` is intentionally installed at runtime inside
> `app.py` rather than pinned in `requirements.txt` — see the comment at the top of
> the file for why (`transformers` actively refuses to import against a
> too-new `huggingface-hub`, which the Gradio SDK requires).

## Project structure

```
.
├── app.py                    # gradio.Server backend: static hosting + /run_document API
├── requirements.txt          # Python build-time deps (transformers installed at runtime)
├── packages.txt              # apt build-time dep: libreoffice (Office → PDF conversion)
├── frontend/                 # Next.js 16 + Tailwind CSS source
│   ├── app/                  # App Router: layout, page, global styles
│   ├── components/           # UploadCard, ResultPanel, Header, Footer
│   ├── lib/                  # @gradio/client wrapper, shared constants
│   └── public/examples/      # Synthetic sample documents (example gallery)
├── .github/workflows/
│   ├── ci.yml                 # Lint + build frontend, lint + syntax-check backend
│   └── deploy.yml             # Build frontend, push to the HF Space on push to master
├── LICENSE
└── README.md
```

`static/` (the built frontend, generated by `npm run build` inside `frontend/`) is not
committed — CI builds it fresh on every deploy.

## CI/CD

- **CI** (`.github/workflows/ci.yml`) — on every PR / non-master push: `npm run lint`
  + `npm run build` for the frontend, `ruff` + `py_compile` for the backend.
- **CD** (`.github/workflows/deploy.yml`) — on push to `master`: builds the frontend,
  assembles the deploy payload, and pushes `app.py`, `requirements.txt`,
  `packages.txt`, `README.md`, and the built `static/` to the Hugging Face Space via
  `hf upload`, authenticated with an `HF_TOKEN` repository secret.

## How it works

- **Model loading** — `AutoModel.from_pretrained("baidu/Unlimited-OCR", trust_remote_code=True)`
  at module scope, per the [ZeroGPU pattern](https://huggingface.co/docs/hub/spaces-zerogpu):
  eager `.cuda()` load so weights are ready to stream into a GPU worker on first request.
- **Streaming** — Unlimited-OCR's `TextStreamer` prints generated tokens straight to
  `stdout` rather than exposing an iterator, so `app.py` runs inference in a background
  thread and taps `stdout` to stream partial output back through the API.
- **File-type routing** — images are used directly; PDFs are rasterized to page images
  with PyMuPDF; Office/text documents are first converted to PDF with headless
  LibreOffice, then rasterized the same way. A single resulting page uses
  `model.infer(...)`; more than one uses `model.infer_multi(...)`.
- **Grounding images** are returned as inline base64 data URLs rather than server file
  paths, sidestepping Gradio's file-serving allowed-paths checks for an ad-hoc tempdir.

## Deploying your own copy

1. Create a new [Gradio Space](https://huggingface.co/new-space) (ZeroGPU hardware
   recommended — requires a PRO/Team/Enterprise plan, or request a free
   [community GPU grant](https://huggingface.co/docs/hub/spaces-zerogpu) on a non-PRO account).
2. Set `GRADIO_SSR_MODE=false` on the Space (`hf spaces variables add <ns>/<name> --env GRADIO_SSR_MODE=false`)
   — required for `app.py`'s custom `/` route to actually serve instead of Gradio's own SSR.
3. Fork this repo, add an `HF_TOKEN` secret (a Hugging Face token with write access),
   update `HF_SPACE` in `.github/workflows/deploy.yml`, and push to `master` — CI/CD
   does the rest. Or deploy once by hand:
   ```bash
   cd frontend && npm ci && npm run build && cd ..
   cp -r frontend/out static
   hf upload <your-username>/<space-name> app.py app.py --repo-type space
   hf upload <your-username>/<space-name> requirements.txt requirements.txt --repo-type space
   hf upload <your-username>/<space-name> packages.txt packages.txt --repo-type space
   hf upload <your-username>/<space-name> README.md README.md --repo-type space
   hf upload <your-username>/<space-name> static static --repo-type space
   ```

## Credits

- Model: [baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR) by Baidu,
  [paper](https://arxiv.org/abs/2606.23050), [GitHub](https://github.com/baidu/Unlimited-OCR) — MIT licensed
- Demo app: built with [Next.js](https://nextjs.org), [Tailwind CSS](https://tailwindcss.com),
  and [Gradio](https://gradio.app) on [Hugging Face Spaces](https://huggingface.co/spaces)

## License

This demo's code is released under the [MIT License](LICENSE). The
Unlimited-OCR model itself is separately MIT licensed by Baidu — see its
[model card](https://huggingface.co/baidu/Unlimited-OCR) for details.
