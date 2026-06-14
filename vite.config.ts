import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// @huggingface/transformers bundles onnxruntime-web (wasm/webgpu); exclude it from
// Vite's dependency pre-bundling to avoid worker/wasm issues.
export default defineConfig(({ command }) => ({
  // Served from https://djdevpro.github.io/RagViewer/ in production; root in dev.
  base: command === "build" ? "/RagViewer/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg", "robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt"],
      manifest: {
        id: "/RagViewer/",
        name: "RagViewer — in-browser RAG over your PDFs",
        short_name: "RagViewer",
        description:
          "Convert PDFs to DocLang, chunk, embed, explore and chat with your documents — entirely in your browser. Local-first RAG with optional Ollama, OpenAI and Qdrant.",
        lang: "en",
        theme_color: "#14161c",
        background_color: "#14161c",
        display: "standalone",
        start_url: "/RagViewer/",
        scope: "/RagViewer/",
        categories: ["productivity", "utilities", "developer"],
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        // onnxruntime-web (wasm) is ~23 MB: raise the precache size limit.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,wasm,svg,png,woff2,ico,txt,xml}"],
        runtimeCaching: [
          {
            // Model weights (HuggingFace CDN): cached after first download -> offline.
            urlPattern: ({ url }) =>
              url.hostname.includes("huggingface.co") ||
              url.hostname.includes("hf.co") ||
              url.hostname.includes("cdn-lfs"),
            handler: "CacheFirst",
            options: {
              cacheName: "hf-models",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // Proxy DocLang conversion to the local docling-serve container (avoids CORS).
    proxy: {
      "/docling": {
        target: "http://localhost:5001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/docling/, ""),
      },
    },
  },
  // onnxruntime-web (used by @doclith/pdf in the worker) ships wasm and breaks under
  // Vite's pre-bundling — exclude it like @huggingface/transformers.
  optimizeDeps: { exclude: ["@huggingface/transformers", "onnxruntime-web", "@doclith/pdf"] },
}));
