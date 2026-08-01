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

Demo of [baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR): one-shot,
long-horizon document parsing to Markdown, with layout grounding boxes.

Custom Next.js + Tailwind CSS frontend, served alongside a `gradio.Server` /
ZeroGPU backend. Upload an image, PDF, or Office document (Word/PowerPoint/
Excel/text) — Gundam mode for speed, Base mode for accuracy.

Source: https://github.com/zestcommerce841428-png/unlimited-ocr-demo
