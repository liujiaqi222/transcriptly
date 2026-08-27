import type { CloudClient } from "@/cloud/client";
import type { CloudQueueStatus } from "@/cloud/jobs";
import type { CloudUploadQueue } from "@/cloud/queue";
import {
  CLOUD_JOB_RETRY,
  CLOUD_QUEUE_STATUS_REQUEST,
  CLOUD_SAVE_ENQUEUE,
  CLOUD_SESSION_REQUEST,
  CLOUD_SIGN_OUT_REQUEST,
  type CloudJobRetryMessage,
  type CloudJobRetryStatus,
  type CloudQueueStatusRequestMessage,
  type CloudSaveEnqueueMessage,
  type CloudSaveEnqueueStatus,
  type CloudSessionRequestMessage,
  type CloudSessionStatus,
  type CloudSignOutRequestMessage,
  type CloudSignOutStatus,
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
  | CloudQueueStatusRequestMessage
  | CloudJobRetryMessage;

export type CloudMessageResult =
  | CloudSessionStatus
  | CloudSignOutStatus
  | CloudSaveEnqueueStatus
  | CloudQueueStatus
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
        case CLOUD_SESSION_REQUEST:
          return deps.client.getSession();

        case CLOUD_SIGN_OUT_REQUEST: {
          const result = await deps.client.signOut();
          if (result.status === "signed-out") {
            try {
              await deps.queue.clearAll();
            } catch (error) {
              // Keep the signed-out result: the server session has already
              // ended. Do not silently lose the local cleanup failure though;
              // the next sign-out attempt retries clearAll().
              console.error(
                "Could not clear cloud jobs after sign-out; retry on the next sign-out.",
                error,
              );
            }
          }
          return result;
        }

        case CLOUD_SAVE_ENQUEUE: {
          try {
            const job = message.confirmPublicProfile
              ? await deps.queue.enqueue(message.capture, {
                  confirmPublicProfile: true,
                })
              : await deps.queue.enqueue(message.capture);
            return { ok: true, jobId: job.id };
          } catch (error) {
            return {
              ok: false,
              message: `Could not queue the public contribution: ${errorMessage(error)}`,
            };
          }
        }

        case CLOUD_QUEUE_STATUS_REQUEST:
          return deps.queue.getStatus(message.videoId);

        case CLOUD_JOB_RETRY: {
          try {
            const job = await deps.queue.retry(message.jobId);
            return job
              ? { ok: true }
              : {
                  ok: false,
                  message:
                    "This public contribution can no longer be retried. Capture the video again.",
                };
          } catch (error) {
            return {
              ok: false,
              message: `Could not retry the public contribution: ${errorMessage(error)}`,
            };
          }
        }

        default:
          return undefined;
      }
    },
  };
}
