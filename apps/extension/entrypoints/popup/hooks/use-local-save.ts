import type { MarkdownFormat } from "@transcriptly/capture";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/entrypoints/popup/utils";
import type { LocalMarkdownSaver } from "@/local-save";
import type { PopupDependencies } from "../app";

/** Everything about the local Markdown destination (#64): the saver, the
 *  remembered directory and its write permission, the folder picker, and
 *  the persisted format preference. */
export function useLocalSave(deps: PopupDependencies) {
  const [saver, setSaver] = useState<LocalMarkdownSaver | undefined>();
  const [saverError, setSaverError] = useState<string | undefined>();
  const [directoryName, setDirectoryName] = useState<string | undefined>();
  const [folderReady, setFolderReady] = useState<boolean | undefined>();
  const [changingFolder, setChangingFolder] = useState(false);
  const [markdownFormat, setMarkdownFormat] =
    useState<MarkdownFormat>("timeline");

  useEffect(() => {
    let cancelled = false;
    deps.markdown
      .getPreference()
      .then((format) => {
        if (!cancelled) setMarkdownFormat(format);
      })
      .catch(() => {
        // Timeline is the safe, backward-compatible default.
      });
    return () => {
      cancelled = true;
    };
  }, [deps]);

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

  // Track whether the background worker can write without a prompt, so the
  // batch-source view can ask for a re-grant when Chrome dropped access.
  useEffect(() => {
    let cancelled = false;
    if (!saver || !directoryName) {
      setFolderReady(undefined);
      return;
    }
    saver
      .hasWritePermission()
      .then((ready) => {
        if (!cancelled) setFolderReady(ready);
      })
      .catch(() => {
        if (!cancelled) setFolderReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saver, directoryName]);

  const handleMarkdownFormatChange = useCallback(
    (format: MarkdownFormat) => {
      setMarkdownFormat(format);
      void deps.markdown.setPreference(format).catch(() => {});
    },
    [deps],
  );

  /** Open the folder picker; the caller reports failures in its own
   *  save state (a failed re-grant surfaces like a failed save). */
  const changeDirectory = useCallback(async (): Promise<
    { ok: true } | { ok: false; message: string }
  > => {
    if (!saver) return { ok: true };
    setChangingFolder(true);
    try {
      const next = await saver.changeDirectory();
      setDirectoryName(next);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    } finally {
      setChangingFolder(false);
    }
  }, [saver]);

  return {
    saver,
    saverError,
    directoryName,
    setDirectoryName,
    folderReady,
    changingFolder,
    markdownFormat,
    handleMarkdownFormatChange,
    changeDirectory,
  };
}

export type LocalSave = ReturnType<typeof useLocalSave>;
