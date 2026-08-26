import { createRoot } from "react-dom/client";
import { getBuiltInAi } from "@/ai/built-in-ai";
import { PlaygroundApp } from "./app";
import "./style.css";

// The Prompt API only exists on supporting desktop Chrome builds. A
// missing global degrades to the page's "unsupported" state; it never
// throws and never affects anything else in the extension.
const ai = getBuiltInAi(globalThis);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(<PlaygroundApp deps={{ ai }} />);
