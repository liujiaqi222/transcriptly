import React from "react";
import { createRoot } from "react-dom/client";
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

createRoot(document.getElementById("root")!).render(<Popup />);
