"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface RemoveContributionButtonProps {
  videoId: string;
  title: string;
}

/**
 * Withdrawal is a quiet tertiary action (#74): an unobtrusive "Remove" link
 * opens a native dialog that carries the destructive weight - the warning
 * copy and the red confirm button live there, never in the row itself.
 */
export function RemoveContributionButton({
  videoId,
  title,
}: RemoveContributionButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string>();

  function open() {
    setError(undefined);
    setRemoving(false);
    dialogRef.current?.showModal();
  }

  async function remove() {
    setRemoving(true);
    try {
      const response = await fetch(`/api/v1/contributions/${videoId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("The contribution could not be removed. Please try again.");
        setRemoving(false);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError("The contribution could not be removed. Please try again.");
      setRemoving(false);
    }
  }

  return (
    <>
      <button
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 text-[13px] font-semibold text-[#64748b] transition-colors hover:text-red-700 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
        onClick={open}
        type="button"
      >
        <Trash2 aria-hidden="true" size={14} />
        Remove
      </button>
      <dialog
        aria-labelledby={`remove-contribution-title-${videoId}`}
        className="
          m-auto w-[min(460px,calc(100vw_-_32px))] rounded-2xl border border-[#e2e8f0] bg-white p-6 text-[#202124] [&::backdrop]:bg-[#202124]/30
        "
        onClose={() => setRemoving(false)}
        ref={dialogRef}
      >
        <h2
          className="m-0 text-xl font-bold tracking-[-0.02em]"
          id={`remove-contribution-title-${videoId}`}
        >
          Remove your contribution?
        </h2>
        <p className="mt-3 mb-0 text-sm leading-6 text-[#64748b]">
          This removes your name from{" "}
          <strong className="font-bold text-[#202124]">{title}</strong>. If you
          are the only contributor, the video is unpublished and its transcript
          is deleted.
        </p>
        {error ? (
          <p className="mt-3 mb-0 text-sm leading-6 text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="min-h-10 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-bold text-[#202124] transition-colors hover:border-[#cbd5e1] focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={removing}
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={removing}
            onClick={() => void remove()}
            type="button"
          >
            {removing ? "Removing…" : "Remove contribution"}
          </button>
        </div>
      </dialog>
    </>
  );
}
