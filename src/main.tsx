import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./notverse/notverse-polish.css";
import "./notverse/notverse-branding-fix.css";
import "./notverse/notverse-icon-data.css";
import { registerReadVerseServiceWorker } from "./platform/storage";

const root = document.getElementById("root");

if (!root) {
  throw new Error("NoTVerse root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void registerReadVerseServiceWorker();
