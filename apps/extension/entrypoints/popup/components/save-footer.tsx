import { ChevronDown, Folder, Globe2, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { LocalMarkdownSaver } from "@/local-save";
import type { AccountState } from "./account-section";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; directoryName: string; filename: string }
  | { status: "error"; message: string };

interface SaveFooterProps {
  saver?: LocalMarkdownSaver;
  saverError?: string;
  directoryName?: string;
  changingFolder: boolean;
  saveState: SaveState;
  /** Cloud destination toggle (#35): only offered to signed-in users. */
  cloudEnabled: boolean;
  cloudAvailable: boolean;
  publicProfileConfirmed: boolean;
  publicConfirmationAccepted: boolean;
  contributorDisplayName?: string;
  publicCopyPublished: boolean;
  accountState: AccountState;
  /** Local Markdown destination: on by default, independently togglable (#64). */
  localEnabled: boolean;
  onLocalToggle(enabled: boolean): void;
  onCloudToggle(enabled: boolean): void;
  onPublicConfirmationChange(accepted: boolean): void;
  onSignIn(): void;
  onSave(): void;
  onChangeFolder(): void;
}

export function SaveFooter({
  saver,
  saverError,
  directoryName,
  changingFolder,
  saveState,
  cloudEnabled,
  cloudAvailable,
  publicProfileConfirmed,
  publicConfirmationAccepted,
  contributorDisplayName,
  publicCopyPublished,
  accountState,
  localEnabled,
  onLocalToggle,
  onCloudToggle,
  onPublicConfirmationChange,
  onSignIn,
  onSave,
  onChangeFolder,
}: SaveFooterProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const destinationSummary =
    localEnabled && cloudEnabled
      ? "Local + Public"
      : localEnabled
        ? "Local"
        : cloudEnabled
          ? "Public archive"
          : "No destination";
  const summaryDetail = localEnabled
    ? (directoryName ?? (saver ? "No folder" : "Loading…"))
    : cloudEnabled
      ? "Public contribution"
      : "Open to choose";

  useEffect(() => {
    if (!optionsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOptionsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [optionsOpen]);

  return (
    <footer className={optionsOpen ? "footer options-open" : "footer"}>
      {optionsOpen && (
        <>
          <button
            type="button"
            className="save-options-backdrop"
            aria-label="Close save options"
            onClick={() => setOptionsOpen(false)}
          />
          <section
            className="save-options-panel"
            id="save-options-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-options-title"
          >
            <div className="save-options-heading">
              <h2 id="save-options-title">Save options</h2>
              <p>Choose where this transcript goes.</p>
            </div>

            <div className="save-destination-list">
              <div className="save-option-card">
                <label className="save-destination-toggle">
                  <Folder aria-hidden="true" />
                  <span className="save-destination-copy">
                    <strong>Local Markdown</strong>
                    <small>Save a Markdown file locally</small>
                  </span>
                  <span className="destination-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label="Local"
                      aria-checked={localEnabled}
                      checked={localEnabled}
                      onChange={(event) => onLocalToggle(event.target.checked)}
                    />
                    <span aria-hidden="true" />
                  </span>
                </label>

                {localEnabled && (
                  <div className="local-save-options">
                    <span className="folder-setting-copy">
                      <span>Folder</span>
                      <strong title={directoryName}>
                        {directoryName ?? (saver ? "No folder" : "Loading…")}
                      </strong>
                    </span>
                    <button
                      type="button"
                      className="link"
                      onClick={onChangeFolder}
                      disabled={!saver || changingFolder}
                    >
                      {changingFolder ? "Changing…" : "Change"}
                    </button>
                  </div>
                )}
              </div>

              <div className="save-option-card">
                {cloudAvailable ? (
                  <label className="save-destination-toggle">
                    <Globe2 aria-hidden="true" />
                    <span className="save-destination-copy">
                      <span className="save-destination-title">
                        <strong>Public archive</strong>
                        {publicCopyPublished && (
                          <span className="published-label">Published</span>
                        )}
                      </span>
                      <small>
                        {publicCopyPublished
                          ? "Keep the public copy updated"
                          : "Publish a copy to Transcriptly"}
                      </small>
                    </span>
                    <span className="destination-switch">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label="Contribute publicly"
                        aria-checked={cloudEnabled}
                        checked={cloudEnabled}
                        onChange={(event) =>
                          onCloudToggle(event.target.checked)
                        }
                      />
                      <span aria-hidden="true" />
                    </span>
                  </label>
                ) : (
                  <div className="public-sign-in">
                    <Globe2 aria-hidden="true" />
                    <span className="save-destination-copy">
                      <strong>Public archive</strong>
                      <small>
                        {accountState.status === "error"
                          ? accountState.message
                          : "Publish a copy to Transcriptly"}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="public-sign-in-button"
                      aria-label="Sign in to contribute publicly"
                      onClick={onSignIn}
                      disabled={
                        accountState.status === "checking" ||
                        accountState.status === "signing-in"
                      }
                    >
                      {accountState.status === "checking"
                        ? "Checking…"
                        : accountState.status === "signing-in"
                          ? "Waiting…"
                          : accountState.status === "error"
                            ? "Try again"
                            : "Sign in"}
                    </button>
                  </div>
                )}

                {cloudEnabled && !publicProfileConfirmed && (
                  <div className="public-confirmation">
                    <p>
                      {`Before your first contribution: this transcript, your display name${
                        contributorDisplayName
                          ? ` (${contributorDisplayName})`
                          : ""
                      }, and optional avatar will be public. Your email is never shown.`}
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={publicConfirmationAccepted}
                        onChange={(event) =>
                          onPublicConfirmationChange(event.target.checked)
                        }
                      />
                      <span>I understand this contribution will be public</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {saverError && (
        <p className="error-banner" role="alert">
          {saverError}
        </p>
      )}

      <div className="compact-save-bar">
        {!optionsOpen && (
          <button
            type="button"
            className="save-summary-button"
            aria-label="Save options"
            aria-expanded="false"
            aria-controls="save-options-panel"
            onClick={() => setOptionsOpen(true)}
          >
            <Settings2 />
            <span className="save-summary-copy">
              <strong>{destinationSummary}</strong>
              <span title={summaryDetail}>{summaryDetail}</span>
            </span>
            <ChevronDown className="save-summary-chevron" />
          </button>
        )}
        <button
          type="button"
          className="save-button"
          onClick={() => {
            onSave();
            if (optionsOpen) setOptionsOpen(false);
          }}
          disabled={
            saveState.status === "saving" ||
            // At least one destination must be selected and usable (#64).
            !((localEnabled && saver) || cloudEnabled) ||
            (cloudEnabled &&
              !publicProfileConfirmed &&
              !publicConfirmationAccepted)
          }
        >
          <Save />
          {saveState.status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </footer>
  );
}
