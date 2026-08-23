import { captureOutcome } from "@transcriptly/capture";
import { enterBatchSelectionMode } from "@/batch/page-ui";
import {
  BATCH_ENTER_SELECTION_REQUEST,
  type BatchEnterSelectionRequestMessage,
  type BatchEnterSelectionStatus,
  CAPTURE_REQUEST,
  type CaptureRequestMessage,
  type CaptureResponseMessage,
  CONTENT_PING,
  type ContentPingMessage,
  type ContentPingResponse,
} from "@/shared/messages";

export default defineContentScript({
  matches: ["*://www.youtube.com/*", "*://m.youtube.com/*"],
  main() {
    browser.runtime.onMessage.addListener(
      (
        message:
          | CaptureRequestMessage
          | ContentPingMessage
          | BatchEnterSelectionRequestMessage,
      ):
        | Promise<
            | CaptureResponseMessage
            | ContentPingResponse
            | BatchEnterSelectionStatus
          >
        | undefined => {
        // On-demand injection (#56): the batch panel and checkboxes only
        // appear when the popup asks for them - never on their own. The
        // selection mode tears itself down on ✕ / Esc / SPA navigation
        // away from batch source pages.
        if (message?.type === BATCH_ENTER_SELECTION_REQUEST) {
          return enterBatchSelectionMode();
        }
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
