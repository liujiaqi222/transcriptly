import { captureOutcome } from "@transcriptly/capture";
import { mountBatchPageUi } from "@/batch/page-ui";
import {
  CAPTURE_REQUEST,
  type CaptureRequestMessage,
  type CaptureResponseMessage,
  CONTENT_PING,
  type ContentPingMessage,
  type ContentPingResponse,
} from "@/shared/messages";

/** YouTube is a SPA: batch pages can appear without a page load. */
const MOUNT_CHECK_INTERVAL_MS = 1500;

export default defineContentScript({
  matches: ["*://www.youtube.com/*", "*://m.youtube.com/*"],
  main() {
    const tryMountBatchPanel = () => {
      void mountBatchPageUi();
    };
    tryMountBatchPanel();
    setInterval(tryMountBatchPanel, MOUNT_CHECK_INTERVAL_MS);

    browser.runtime.onMessage.addListener(
      (
        message: CaptureRequestMessage | ContentPingMessage,
      ): Promise<CaptureResponseMessage | ContentPingResponse> | undefined => {
        if (message?.type === CONTENT_PING) {
          return Promise.resolve({ ok: true });
        }
        if (message?.type !== CAPTURE_REQUEST) return undefined;
        return captureOutcome(document, location.href, {
          timeoutMs: message.timeoutMs,
        });
      },
    );
  },
});
