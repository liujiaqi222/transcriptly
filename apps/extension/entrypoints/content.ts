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
  SENTRY_REPORT,
} from "@/shared/messages";
import { isExtensionOrigin, serializeError } from "@/shared/sentry";

/**
 * Forward uncaught extension errors to the background worker, which owns
 * the Sentry client (content scripts must not load it: YouTube's CSP can
 * block the transport, and every YouTube page would pay the bundle size).
 * Page-originated errors are filtered out — only frames from our own
 * extension URL are ours.
 */
function forwardExtensionError(
  detail: string | undefined,
  error: unknown,
): void {
  const source = error instanceof Error ? error.stack : detail;
  if (!isExtensionOrigin(source, browser.runtime.getURL(""))) return;
  void browser.runtime
    .sendMessage({
      type: SENTRY_REPORT,
      error: serializeError(error ?? detail),
      context: { page: location.pathname },
    })
    .catch(() => undefined);
}

export default defineContentScript({
  matches: ["*://www.youtube.com/*", "*://m.youtube.com/*"],
  main() {
    window.addEventListener("error", (event) => {
      forwardExtensionError(event.filename, event.error);
    });
    window.addEventListener("unhandledrejection", (event) => {
      forwardExtensionError(
        String(event.reason ?? ""),
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
      );
    });

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
