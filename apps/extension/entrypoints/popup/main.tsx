import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { serializeToMarkdown } from "@transcriptly/capture";
import "./style.css";

function Popup() {
  const schemaReady = typeof serializeToMarkdown === "function";
  return (
    <div className="popup">
      <h1>Transcriptly</h1>
      <p className="muted">Popup scaffold {schemaReady ? "ready" : "broken"}</p>
    </div>
  );
}

declare global {
  interface Window {
    __transcriptlyRoot?: Root;
  }
}

const container = document.getElementById("root")!;
const root = window.__transcriptlyRoot ?? createRoot(container);
window.__transcriptlyRoot = root;
root.render(<Popup />);
