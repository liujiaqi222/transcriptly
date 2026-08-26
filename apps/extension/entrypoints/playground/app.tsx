import {
  CircleAlert,
  Eraser,
  Play,
  RefreshCw,
  Sparkles,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BuiltInAi, BuiltInAiSession } from "@/ai/built-in-ai";
import { LogoMark } from "@/brand/logo-mark";

/**
 * The built-in AI Playground page (#78): a standalone tab where the user
 * can experiment with Chrome's Prompt API (Gemini Nano) free-form.
 *
 * The page is deliberately decoupled from everything else in the
 * extension - no Capture, Local Markdown, Public Contribution, or
 * database involvement, and no persistence: prompts and responses live
 * only in this page's memory. Closing the page destroys the active
 * session and aborts any in-flight request.
 *
 * The browser API is injected via `deps.ai` (the `BuiltInAi` seam in
 * `ai/built-in-ai.ts`), so unsupported, downloadable, downloading,
 * available, and error states are deterministic in tests.
 */

export interface PlaygroundDependencies {
  /** The Prompt API seam; `undefined` when the feature is absent. */
  ai?: BuiltInAi;
}

/** Model-side state machine shown in the status card. */
type ModelState =
  | { status: "checking" }
  | { status: "unsupported" }
  | { status: "unavailable" }
  | { status: "downloadable" }
  | { status: "downloading"; progress: number | undefined }
  | { status: "available" }
  | { status: "error"; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Prompt API rejections for aborted requests surface as AbortError. */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === "AbortError" &&
    !errorMessage(error).toLowerCase().includes("permission")
  );
}

/** Chrome reports progress as a 0-1 fraction (loaded / total). */
function progressFraction(loaded: number, total: number): number | undefined {
  if (total <= 0) return undefined;
  return Math.min(1, Math.max(0, loaded / total));
}

export function PlaygroundApp({ deps }: { deps: PlaygroundDependencies }) {
  const [modelState, setModelState] = useState<ModelState>({
    status: "checking",
  });
  const [promptInput, setPromptInput] = useState("");
  const [response, setResponse] = useState<string | undefined>();
  const [runPhase, setRunPhase] = useState<"idle" | "running">("idle");
  const [runNote, setRunNote] = useState<string | undefined>();
  const [runError, setRunError] = useState<string | undefined>();

  const sessionRef = useRef<BuiltInAiSession | undefined>(undefined);
  const runAbortRef = useRef<AbortController | undefined>(undefined);
  const prepareAbortRef = useRef<AbortController | undefined>(undefined);
  const preparingRef = useRef(false);

  /** Destroy the active session and abort resources (#78 teardown). */
  const teardown = useCallback(() => {
    runAbortRef.current?.abort();
    runAbortRef.current = undefined;
    prepareAbortRef.current?.abort();
    prepareAbortRef.current = undefined;
    preparingRef.current = false;
    sessionRef.current?.destroy();
    sessionRef.current = undefined;
  }, []);

  // Closing the page (or unmounting in tests) must destroy the session
  // even though React's cleanup never runs on tab close.
  useEffect(() => {
    const onPageHide = () => teardown();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      teardown();
    };
  }, [teardown]);

  const checkModel = useCallback(async () => {
    if (!deps.ai) {
      setModelState({ status: "unsupported" });
      return;
    }
    setModelState({ status: "checking" });
    try {
      const availability = await deps.ai.availability();
      setModelState(
        availability === "unavailable"
          ? { status: "unavailable" }
          : availability === "downloadable"
            ? { status: "downloadable" }
            : availability === "downloading"
              ? { status: "downloading", progress: undefined }
              : { status: "available" },
      );
    } catch (error) {
      setModelState({ status: "error", message: errorMessage(error) });
    }
  }, [deps.ai]);

  useEffect(() => {
    void checkModel();
  }, [checkModel]);

  // Model preparation always starts from this explicit user action; the
  // monitor's downloadprogress events drive the progress bar.
  const prepareModel = useCallback(async () => {
    if (!deps.ai || preparingRef.current) return;
    preparingRef.current = true;
    const controller = new AbortController();
    prepareAbortRef.current = controller;
    setModelState({ status: "downloading", progress: undefined });
    try {
      const session = await deps.ai.create({
        signal: controller.signal,
        monitor: (monitor) => {
          monitor.addEventListener("downloadprogress", (event) => {
            const next = progressFraction(event.loaded, event.total);
            setModelState((current) =>
              current.status === "downloading"
                ? { status: "downloading", progress: next }
                : current,
            );
          });
        },
      });
      sessionRef.current = session;
      setModelState({ status: "available" });
    } catch (error) {
      if (!isAbortError(error)) {
        sessionRef.current = undefined;
        setModelState({ status: "error", message: errorMessage(error) });
      }
    } finally {
      preparingRef.current = false;
      if (prepareAbortRef.current === controller) {
        prepareAbortRef.current = undefined;
      }
    }
  }, [deps.ai]);

  const runPrompt = useCallback(async () => {
    const text = promptInput.trim();
    if (!text || runPhase === "running" || !deps.ai) return;
    setRunPhase("running");
    setRunError(undefined);
    setRunNote(undefined);
    setResponse(undefined);
    const controller = new AbortController();
    runAbortRef.current = controller;
    try {
      const session = sessionRef.current ?? (await deps.ai.create());
      sessionRef.current = session;
      const result = await session.prompt(text, {
        signal: controller.signal,
      });
      setResponse(result);
    } catch (error) {
      if (isAbortError(error)) {
        setRunNote("Stopped.");
      } else {
        setRunError(errorMessage(error));
      }
    } finally {
      // The run's abort resource is released on completion.
      if (runAbortRef.current === controller) {
        runAbortRef.current = undefined;
      }
      setRunPhase("idle");
    }
  }, [promptInput, runPhase, deps.ai]);

  const stopRun = useCallback(() => {
    runAbortRef.current?.abort();
  }, []);

  const clearPage = useCallback(() => {
    setPromptInput("");
    setResponse(undefined);
    setRunNote(undefined);
    setRunError(undefined);
  }, []);

  const available = modelState.status === "available";
  const canRun =
    available && runPhase === "idle" && promptInput.trim().length > 0;

  return (
    <div className="playground">
      <header className="playground-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <LogoMark />
          </span>
          <h1>Transcriptly AI Playground</h1>
        </div>
      </header>
      <main className="playground-body">
        <section className="playground-intro">
          <h2>
            <Sparkles /> Experiment with Chrome&apos;s built-in AI
          </h2>
          <p>
            Prompts run on-device with Gemini Nano via the Prompt API. Nothing
            you type here is saved or sent to Transcriptly servers, and closing
            this page ends the session.
          </p>
        </section>

        {modelState.status === "checking" && (
          <section className="status-card" role="status">
            <p className="status-title">
              <RefreshCw /> Checking availability…
            </p>
          </section>
        )}

        {modelState.status === "unsupported" && (
          <section className="status-card" role="status">
            <p className="status-title">
              <CircleAlert /> Built-in AI is not available in this browser
            </p>
            <p className="status-copy">
              This browser does not expose Chrome&apos;s built-in Prompt API.
              Use desktop Chrome 138 or newer with the on-device model enabled.
            </p>
          </section>
        )}

        {modelState.status === "unavailable" && (
          <section className="status-card" role="status">
            <p className="status-title">
              <CircleAlert /> Your device is not eligible yet
            </p>
            <p className="status-copy">
              Chrome does not offer the built-in model here. The model needs
              free disk space, RAM, and a capable GPU on desktop Chrome.
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void checkModel()}
            >
              <RefreshCw />
              Check again
            </button>
          </section>
        )}

        {modelState.status === "downloadable" && (
          <section className="status-card">
            <p className="status-title">
              <Sparkles /> Model not downloaded yet
            </p>
            <p className="status-copy">
              Preparing the model downloads roughly 2&nbsp;GB once; after that
              it runs fully on-device.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => void prepareModel()}
            >
              <Sparkles />
              Prepare model
            </button>
          </section>
        )}

        {modelState.status === "downloading" && (
          <section className="status-card" role="status">
            <p className="status-title">
              <RefreshCw /> Downloading the built-in model…
            </p>
            {modelState.progress === undefined ? (
              <p className="status-copy">Waiting for progress…</p>
            ) : (
              <progress
                aria-label="Model download progress"
                value={modelState.progress}
                max={1}
              />
            )}
            <p className="status-copy">
              You can keep this tab open; the download continues in Chrome.
            </p>
          </section>
        )}

        {modelState.status === "error" && (
          <section className="status-card" role="alert">
            <p className="status-title">
              <CircleAlert /> Built-in AI hit an error
            </p>
            <p className="status-copy">{modelState.message}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void checkModel()}
            >
              <RefreshCw />
              Try again
            </button>
          </section>
        )}

        {available && (
          <section className="prompt-card">
            <label className="prompt-label" htmlFor="playground-prompt">
              Prompt
            </label>
            <textarea
              id="playground-prompt"
              value={promptInput}
              rows={5}
              placeholder="Ask anything…"
              onChange={(event) => setPromptInput(event.target.value)}
            />
            <div className="prompt-actions">
              <button
                className="primary-button"
                type="button"
                disabled={!canRun}
                onClick={() => void runPrompt()}
              >
                <Play />
                Run
              </button>
              {runPhase === "running" && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={stopRun}
                >
                  <Square />
                  Stop
                </button>
              )}
              <button
                className="secondary-button"
                type="button"
                disabled={runPhase === "running"}
                onClick={clearPage}
              >
                <Eraser />
                Clear
              </button>
            </div>
            <div className="response" aria-live="polite">
              <h3>Response</h3>
              {runPhase === "running" && (
                <p className="status-title" role="status">
                  <RefreshCw /> Running…
                </p>
              )}
              {response !== undefined && <pre>{response}</pre>}
              {runNote !== undefined && (
                <p className="response-note">{runNote}</p>
              )}
              {runError !== undefined && (
                <p className="response-error" role="alert">
                  {runError}
                </p>
              )}
              {runPhase === "idle" &&
                response === undefined &&
                runNote === undefined &&
                runError === undefined && (
                  <p className="response-empty">
                    The model&apos;s answer will appear here.
                  </p>
                )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
