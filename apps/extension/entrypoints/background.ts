import { cloudClient } from "@/cloud/client";
import {
  CLOUD_SESSION_REQUEST,
  CLOUD_SIGN_OUT_REQUEST,
  type CloudSessionRequestMessage,
  type CloudSessionStatus,
  type CloudSignOutRequestMessage,
  type CloudSignOutStatus,
} from "@/shared/messages";

/**
 * The background service worker is the only place that talks to the cloud.
 * The popup asks it for session status and sign-out; no session material
 * ever flows through the content script or popup messages.
 */
export default defineBackground({
  main() {
    browser.runtime.onMessage.addListener(
      (
        message: CloudSessionRequestMessage | CloudSignOutRequestMessage,
      ):
        | Promise<CloudSessionStatus | CloudSignOutStatus>
        | undefined => {
        switch (message?.type) {
          case CLOUD_SESSION_REQUEST:
            return cloudClient.getSession();
          case CLOUD_SIGN_OUT_REQUEST:
            return cloudClient.signOut();
          default:
            return undefined;
        }
      },
    );
  },
});
