import { captureOutcome } from "@transcriptly/capture";
import { mountBatchProgressCapsule } from "@/batch/selection/capsule";
import { enterBatchSelectionMode } from "@/batch/selection/page-ui";
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
    // The floating progress capsule (#58) is independent of selection
    // mode: batch source pages show it whenever a batch is running, and
    // it opens the manager page on click.
    mountBatchProgressCapsule();

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
