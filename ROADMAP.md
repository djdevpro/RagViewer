# Roadmap

The browser app in this repository is a **preview / demo** — a deliberately lightweight, browser-only slice of the pipeline so anyone can try the workflow with zero install. The real product is the upcoming **local edition**: an intuitive workbench to benchmark and experiment with the **world's best models** on your own documents.

> ⭐ **Recommendation:** come back to this repo at the official release — that's when the top models on the market get integrated.

## Web preview (now)

- PDF → DocLang conversion in the browser
- Configurable chunking (5 strategies) with live preview
- In-browser (Transformers.js) or Ollama embeddings
- EntityDB (IndexedDB) or remote Qdrant vector store
- Embedding-cloud explore + semantic search
- Streaming RAG chat (OpenAI / Ollama) with versioned chunkings

## Local edition (planned)

- **Native power** — a much more capable local build; a **Rust** core is on the roadmap for fast, large-scale ingestion well beyond what a browser tab can do.
- **Best-in-class models** — the strongest embedding, reranking and chat models on the market, not only the small in-browser ones.
- **A real vector database by default** — **Qdrant** or **LanceDB** out of the box, instead of the browser IndexedDB store.
- **Database management** — manage collections, indexes and stored documents directly from the UI.
- **Versioning in the database** — chunking versions persisted and managed server-side, not just per session.
- **Ingest anything** — robust ingestion for any document type.

## Goal

An intuitive interface to test and compare the world's best models on your own documents, end to end.
