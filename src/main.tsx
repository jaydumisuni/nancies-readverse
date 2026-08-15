import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./notverse/notverse-polish.css";
import "./notverse/notverse-branding-fix.css";
import "./notverse/mobile-geometry-fix.css";
import "./notverse/adaptive-interaction-fix.css";
import "./notverse/final-viewport-stability.css";
import "./notverse/production-polish.css";
import "./notverse/runtime-interaction-fix";
import "./notverse/conversation-scroll";
import "./notverse/focused-inbox-viewport.css";
import "./notverse/notes-social-completion.css";
import "./notverse/notes-header-touch-targets.css";
import "./notverse/notes-notification-label";
import "./notverse/replies-enter-submit";
import "./notverse/real-device-mobile-final.css";
import "./notverse/real-device-mobile-controller";
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
