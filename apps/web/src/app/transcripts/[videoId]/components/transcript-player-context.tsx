"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

export interface PlayerController {
  seekTo: (seconds: number, autoPlay?: boolean) => void;
}

interface TranscriptPlayerContextValue {
  /** Seek player to target timestamp in seconds and start playing. */
  seekTo: (seconds: number) => void;
  /** Register a player controller implementation (e.g. from YouTubePlayer). */
  registerController: (controller: PlayerController) => () => void;
  /** Whether an active player controller is currently registered. */
  hasPlayer: boolean;
}

const TranscriptPlayerContext = createContext<TranscriptPlayerContextValue>({
  seekTo: () => {},
  registerController: () => () => {},
  hasPlayer: false,
});

export function TranscriptPlayerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const controllerRef = useRef<PlayerController | null>(null);
  const [hasPlayer, setHasPlayer] = useState(false);

  const registerController = useCallback((controller: PlayerController) => {
    controllerRef.current = controller;
    setHasPlayer(true);
    return () => {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setHasPlayer(false);
      }
    };
  }, []);

  const seekTo = useCallback((seconds: number) => {
    controllerRef.current?.seekTo(seconds, true);
  }, []);

  return (
    <TranscriptPlayerContext.Provider
      value={{
        seekTo,
        registerController,
        hasPlayer,
      }}
    >
      {children}
    </TranscriptPlayerContext.Provider>
  );
}

export function useTranscriptPlayer(): TranscriptPlayerContextValue {
  return useContext(TranscriptPlayerContext);
}
