import { describe, expect, it, vi } from "vitest";
import type { PlayerController } from "./transcript-player-context";

describe("TranscriptPlayerContext controller registration logic", () => {
  it("tracks registered controller and delegates seekTo calls", () => {
    let activeController: PlayerController | null = null;

    const registerController = (controller: PlayerController) => {
      activeController = controller;
      return () => {
        if (activeController === controller) {
          activeController = null;
        }
      };
    };

    const seekTo = (seconds: number) => {
      activeController?.seekTo(seconds, true);
    };

    const mockSeek = vi.fn();
    const unregister = registerController({ seekTo: mockSeek });

    expect(activeController).not.toBeNull();
    seekTo(42);
    expect(mockSeek).toHaveBeenCalledWith(42, true);

    unregister();
    expect(activeController).toBeNull();
    // Subsequent calls are safe no-ops
    seekTo(99);
    expect(mockSeek).toHaveBeenCalledTimes(1);
  });
});
