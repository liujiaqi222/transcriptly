"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface RemoveContributionButtonProps {
  videoId: string;
  title: string;
}

type RemoveState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "removing" }
  | { status: "error"; message: string };

/**
 * Two-step withdrawal: the first click only arms the confirmation, the
 * second commits. Confirmation is required because removal is destructive
 * and, for the final contributor, unpublishes the video (#74).
 */
export function RemoveContributionButton({
  videoId,
  title,
}: RemoveContributionButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<RemoveState>({ status: "idle" });

  async function remove() {
    setState({ status: "removing" });
    try {
      const response = await fetch(`/api/v1/contributions/${videoId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setState({
          status: "error",
          message: "The contribution could not be removed. Please try again.",
        });
        return;
      }
      setState({ status: "idle" });
      router.refresh();
    } catch {
      setState({
        status: "error",
        message: "The contribution could not be removed. Please try again.",
      });
    }
  }

  if (state.status === "confirming" || state.status === "removing") {
    const pending = state.status === "removing";
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] leading-6 text-red-700">
          Remove your contribution to{" "}
          <strong className="font-bold">{title}</strong>? If you are the only
          contributor, the video is unpublished and its transcript is deleted.
        </span>
        <button
          className="min-h-10 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          onClick={() => void remove()}
          type="button"
        >
          {pending ? "Removing…" : "Yes, remove"}
        </button>
        <button
          className="min-h-10 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-bold text-[#202124] transition-colors hover:border-[#cbd5e1] focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          onClick={() => setState({ status: "idle" })}
          type="button"
        >
          Keep it
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="min-h-10 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-semibold text-[#64748b] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
        onClick={() => setState({ status: "confirming" })}
        type="button"
      >
        Remove contribution
      </button>
      {state.status === "error" ? (
        <span className="text-[13px] leading-6 text-red-700" role="alert">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
