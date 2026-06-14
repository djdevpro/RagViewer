# RagViewer

**In-browser RAG over your PDFs.** Convert a PDF to [DocLang](https://github.com/doclang-project/doclang), chunk it, embed it, explore the embedding cloud, and chat with your documents — entirely in your browser. Local-first, with optional Ollama, OpenAI and Qdrant.

🔗 **Live demo:** https://djdevpro.github.io/RagViewer/

[![Deploy](https://github.com/djdevpro/RagViewer/actions/workflows/deploy.yml/badge.svg)](https://github.com/djdevpro/RagViewer/actions/workflows/deploy.yml)
![PWA](https://img.shields.io/badge/PWA-installable%20%26%20offline-14161c)
![License](https://img.shields.io/badge/license-MIT-14161c)

> ⚠️ **This web app is a preview / demo.** The real product is the upcoming **local edition** — see the [**Roadmap**](ROADMAP.md). ⭐ Star the repo and check back at the official release.

## Pipeline

```
PDF ──► DocLang (in-browser, or docling-serve)
     ──► Chunking (5 strategies, live preview)
     ──► Embeddings (Transformers.js or Ollama)
     ──► Vector index (EntityDB / IndexedDB, or Qdrant)
     ──► Explore (embedding cloud + semantic search)
     ──► Chat (RAG, streaming, cited sources — OpenAI or Ollama)
```

Everything can run on-device; cloud providers (OpenAI, a remote Qdrant) are optional.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Build & test: `pnpm build` · `pnpm test`.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via [`deploy.yml`](.github/workflows/deploy.yml). One-time: **Settings → Pages → Source: GitHub Actions**.

## License

MIT — see [LICENSE](LICENSE).
