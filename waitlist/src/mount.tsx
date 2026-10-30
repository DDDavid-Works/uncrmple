import { StrictMode, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./styles.css";

/** Renders a page into #root, hydrating the pre-rendered markup when there is some. */
export function mount(page: ReactNode) {
  const container = document.getElementById("root");
  if (!container) throw new Error("Root element #root not found");

  const app = <StrictMode>{page}</StrictMode>;

  // Pre-rendered pages already contain markup; hydrate it. In dev the root only holds the
  // <!--app-html--> placeholder comment, so check for elements rather than any child node.
  if (container.firstElementChild) {
    hydrateRoot(container, app);
  } else {
    createRoot(container).render(app);
  }
}
