import type { CloudClient } from "@/cloud/client";
import type { CloudSnapshot } from "@/cloud/jobs";
import type { CloudUploadQueue } from "@/cloud/queue";
import type {
  CloudJobRetryMessage,
  CloudJobRetryStatus,
  CloudSaveEnqueueMessage,
  CloudSaveEnqueueStatus,
  CloudSessionRequestMessage,
  CloudSessionStatus,
  CloudSignOutRequestMessage,
  CloudSignOutStatus,
  CloudSnapshotRequestMessage,
} from "@/shared/messages";

/**
 * The background message surface for everything cloud. The popup talks to
 * this router; session material never flows through the content script.
 *
 * Sign-out also drops every cloud Job, payload and receipt (#36). Unknown
 * message types resolve to undefined so other listeners can handle them.
 */
export interface CloudRouterDependencies {
  client: Pick<CloudClient, "getSession" | "signOut">;
  queue: CloudUploadQueue;
}

export type CloudMessage =
  | CloudSessionRequestMessage
  | CloudSignOutRequestMessage
  | CloudSaveEnqueueMessage
  | CloudSnapshotRequestMessage
  | CloudJobRetryMessage;

export type CloudMessageResult =
  | CloudSessionStatus
  | CloudSignOutStatus
  | CloudSaveEnqueueStatus
  | CloudSnapshot
  | CloudJobRetryStatus;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCloudMessageRouter(deps: CloudRouterDependencies) {
  return {
    async handle(
      message: CloudMessage,
    ): Promise<CloudMessageResult | undefined> {
      switch (message?.type) {
        case "transcriptly:cloud-session-request":
          return deps.client.getSession();

        case "transcriptly:cloud-sign-out-request": {
          const result = await deps.client.signOut();
          if (result.status === "signed-out") {
            try {
              await deps.queue.clearAll();
            } catch {
              // The session is gone either way; leftover Jobs will fail
              // with 401 on the next attempt and surface the auth prompt.
            }
          }
          return result;
        }

        case "transcriptly:cloud-save-enqueue": {
          try {
            const job = await deps.queue.enqueue(message.capture);
            return { ok: true, jobId: job.id };
          } catch (error) {
            return {
              ok: false,
              message: `Could not queue the cloud save: ${errorMessage(error)}`,
            };
          }
        }

        case "transcriptly:cloud-snapshot-request":
          return deps.queue.snapshot(message.videoId);

        case "transcriptly:cloud-job-retry": {
          try {
            const job = await deps.queue.retry(message.jobId);
            return job
              ? { ok: true }
              : {
                  ok: false,
                  message:
                    "This cloud save can no longer be retried. Capture the video again.",
                };
          } catch (error) {
            return {
              ok: false,
              message: `Could not retry the cloud save: ${errorMessage(error)}`,
            };
          }
        }

        default:
          return undefined;
      }
    },
  };
}
