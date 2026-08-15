import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  canonicalWatchUrl,
  formatTimestamp,
  parseVideoId,
} from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import {
  suggestedMarkdownFilename,
  type LocalMarkdownSaver,
} from "../../local-save";
import type { CaptureResponseMessage } from "../../shared/messages";

export interface PopupTab {
  id?: number;
  url?: string;
}

export interface PopupDependencies {
  getActiveTab(): Promise<PopupTab | undefined>;
  requestCapture(tabId: number): Promise<CaptureResponseMessage>;
  createSaver(): Promise<LocalMarkdownSaver>;
}

type CaptureState =
  | { status: "capturing" }
  | { status: "ready"; capture: Capture }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; directoryName: string; filename: string }
  | { status: "error"; message: string };

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "m.youtube.com"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isYouTubeWatchUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    if (!YOUTUBE_HOSTS.has(new URL(url).hostname)) return false;
  } catch {
    return false;
  }
  return parseVideoId(url) !== null;
}

function segmentUrl(videoId: string, start: number): string {
  return `${canonicalWatchUrl(videoId)}&t=${start}`;
}

function transcriptRows(capture: Capture): ReactNode[] {
  return capture.segments.map((segment, index) => (
    <p className="segment" key={`segment-${index}`}>
      [<a href={segmentUrl(capture.source.videoId, segment.start)}>{formatTimestamp(segment.start)}</a>]{" "}
      {segment.text}
    </p>
  ));
}

function properties(capture: Capture): Array<[string, string]> {
  const source = capture.source;
  const rows: Array<[string, string]> = [
    ["Title", source.title],
    ["Channel", source.channelName],
    ["Video", source.url],
    ["Video ID", source.videoId],
  ];
  if (source.publishedAt !== undefined) {
    rows.push(["Published", source.publishedAt]);
  }
  if (source.language !== undefined) {
    rows.push(["Language", source.language]);
  }
  if (source.durationSeconds !== undefined) {
    rows.push(["Duration", `${source.durationSeconds}s`]);
  }
  rows.push(["Captured", capture.capturedAt]);
  return rows;
}

export function Popup({ deps }: { deps: PopupDependencies }) {
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: "capturing",
  });
  const [saver, setSaver] = useState<LocalMarkdownSaver | undefined>();
  const [saverError, setSaverError] = useState<string | undefined>();
  const [directoryName, setDirectoryName] = useState<string | undefined>();
  const [filename, setFilename] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [changingFolder, setChangingFolder] = useState(false);

  const runCapture = useCallback(async () => {
    setCaptureState({ status: "capturing" });
    setSaveState({ status: "idle" });
    try {
      const tab = await deps.getActiveTab();
      if (!tab) {
        setCaptureState({
          status: "error",
          message: "No active tab found. Open a YouTube video and try again.",
        });
        return;
      }
      if (tab.id === undefined || !isYouTubeWatchUrl(tab.url)) {
        setCaptureState({
          status: "error",
          message:
            "Transcriptly works on YouTube watch pages. Open a YouTube video and try again.",
        });
        return;
      }

      const response = await deps.requestCapture(tab.id);
      if (!response.ok) {
        setCaptureState({ status: "error", message: response.message });
        return;
      }
      if (response.capture.segments.length === 0) {
        setCaptureState({
          status: "error",
          message: "No transcript found on this video.",
        });
        return;
      }

      setFilename(suggestedMarkdownFilename(response.capture));
      setCaptureState({ status: "ready", capture: response.capture });
    } catch (error) {
      const detail = errorMessage(error);
      setCaptureState({
        status: "error",
        message: detail.includes("Receiving end does not exist")
          ? "Could not reach the transcript capture script. Reload the YouTube page and try again."
          : `Could not capture this page: ${detail}`,
      });
    }
  }, [deps]);

  useEffect(() => {
    void runCapture();
  }, [runCapture]);

  useEffect(() => {
    let cancelled = false;
    deps
      .createSaver()
      .then(async (created) => {
        setSaver(created);
        const savedName = await created.getSavedDirectoryName();
        if (!cancelled) setDirectoryName(savedName);
      })
      .catch((error: unknown) => {
        if (!cancelled) setSaverError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [deps]);

  const handleSave = async () => {
    if (!saver || captureState.status !== "ready") return;
    setSaveState({ status: "saving" });
    try {
      const result = await saver.save(captureState.capture, filename);
      setFilename(result.filename);
      setDirectoryName(result.directoryName);
      setSaveState({
        status: "saved",
        directoryName: result.directoryName,
        filename: result.filename,
      });
    } catch (error) {
      setSaveState({ status: "error", message: errorMessage(error) });
    }
  };

  const handleChangeFolder = async () => {
    if (!saver) return;
    setChangingFolder(true);
    try {
      const next = await saver.changeDirectory();
      setDirectoryName(next);
    } catch (error) {
      setSaveState({ status: "error", message: errorMessage(error) });
    } finally {
      setChangingFolder(false);
    }
  };

  return (
    <div className="popup">
      <h1>Transcriptly</h1>

      {captureState.status === "capturing" && (
        <div className="capturing" role="status">
          <p>Capturing transcript…</p>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton short" />
        </div>
      )}

      {captureState.status === "error" && (
        <div className="error-banner" role="alert">
          <p>{captureState.message}</p>
          <button type="button" onClick={() => void runCapture()}>
            Try again
          </button>
        </div>
      )}

      {captureState.status === "ready" && (
        <>
          <label className="field-label" htmlFor="filename">
            File name
          </label>
          <input
            id="filename"
            className={saveState.status === "saved" ? "filename saved" : "filename"}
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            spellCheck={false}
          />

          <details className="properties">
            <summary>Properties</summary>
            <dl>
              {properties(captureState.capture).map(([label, value]) => (
                <div className="property" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </details>

          <section className="preview" aria-label="Transcript preview">
            {captureState.capture.source.description.trim().length > 0 && (
              <blockquote className="description">
                {captureState.capture.source.description
                  .split("\n")
                  .map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
              </blockquote>
            )}
            <h2>Transcript</h2>
            {transcriptRows(captureState.capture)}
          </section>

          {saveState.status === "saved" && (
            <p className="success-banner" role="status">
              Saved to {saveState.directoryName}/{saveState.filename}
            </p>
          )}
          {saveState.status === "error" && (
            <p className="error-banner" role="alert">
              {saveState.message}
            </p>
          )}

          <footer className="footer">
            <label className="toggle">
              <input type="checkbox" checked disabled readOnly /> Local
            </label>
            <p className="save-to">
              Save to:{" "}
              <span className="directory">
                {directoryName ?? (saver ? "No folder selected" : "…")}
              </span>{" "}
              <button
                type="button"
                className="link"
                onClick={() => void handleChangeFolder()}
                disabled={!saver || changingFolder}
              >
                {changingFolder ? "Changing…" : "Change"}
              </button>
            </p>
            <label className="toggle">
              <input type="checkbox" disabled /> Cloud
            </label>
            <p className="cloud">Sign in to save to cloud</p>
            {saverError && (
              <p className="error-banner" role="alert">
                {saverError}
              </p>
            )}
            <button
              type="button"
              className="save-button"
              onClick={() => void handleSave()}
              disabled={saveState.status === "saving" || !saver}
            >
              {saveState.status === "saving" ? "Saving…" : "Save"}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
