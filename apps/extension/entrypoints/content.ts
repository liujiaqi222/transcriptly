import { captureOutcome } from "@transcriptly/capture";
import { CAPTURE_REQUEST, type CaptureRequestMessage, type CaptureResponseMessage } from "@/shared/messages";

export default defineContentScript({
  matches: ["*://www.youtube.com/*", "*://m.youtube.com/*"],
  main() {
    browser.runtime.onMessage.addListener(
      (
        message: CaptureRequestMessage,
      ): Promise<CaptureResponseMessage> | undefined => {
        if (message?.type !== CAPTURE_REQUEST) return undefined;
        return captureOutcome(document, location.href);
      },
    );
  },
});
