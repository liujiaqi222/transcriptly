import type { Capture } from "@transcriptly/schema";
import { useCallback, useEffect, useState } from "react";
import {
  AccountSection,
  type AccountDependencies,
  CaptureView,
  type SaveState,
} from "@/entrypoints/popup/components";
import { errorMessage, isYouTubeWatchUrl } from "@/entrypoints/popup/utils";
import {
  type LocalMarkdownSaver,
  suggestedMarkdownFilename,
} from "@/local-save";
import type { CaptureResponseMessage } from "@/shared/messages";

export interface PopupTab {
  id?: number;
  url?: string;
}

export interface PopupDependencies {
  getActiveTab(): Promise<PopupTab | undefined>;
  requestCapture(tabId: number): Promise<CaptureResponseMessage>;
  createSaver(): Promise<LocalMarkdownSaver>;
  account: AccountDependencies;
}

type CaptureState =
  | { status: "capturing" }
  | { status: "ready"; capture: Capture }
  | { status: "error"; message: string };

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
      <AccountSection deps={deps.account} />

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
        <CaptureView
          capture={captureState.capture}
          filename={filename}
          saver={saver}
          saverError={saverError}
          directoryName={directoryName}
          changingFolder={changingFolder}
          saveState={saveState}
          onFilenameChange={setFilename}
          onSave={() => void handleSave()}
          onChangeFolder={() => void handleChangeFolder()}
        />
      )}
    </div>
  );
}
