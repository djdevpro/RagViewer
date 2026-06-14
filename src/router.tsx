import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./routes/__root";
import { Home } from "./routes/index";
import { DoclangViewer } from "./routes/doclang";

const rootRoute = createRootRoute({ component: RootLayout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: DoclangViewer });
const detourageRoute = createRoute({ getParentRoute: () => rootRoute, path: "/detourage", component: Home });
const routeTree = rootRoute.addChildren([indexRoute, detourageRoute]);

// Under GitHub Pages the app is served from /RagViewer/; Vite exposes that as
// BASE_URL so the router resolves routes beneath the subpath (and "/" in dev).
const basepath = import.meta.env.BASE_URL.replace(/\/$/, "");

export const router = createRouter({ routeTree, basepath: basepath || undefined });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
