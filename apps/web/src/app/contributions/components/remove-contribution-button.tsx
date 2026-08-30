"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface RemoveContributionButtonProps {
  videoId: string;
  title: string;
}

/**
 * Withdrawal is a quiet tertiary action (#74): an unobtrusive "Remove" link
 * opens a dialog that carries the destructive weight - the warning copy and
 * the red confirm button live there, never in the row itself.
 */
export function RemoveContributionButton({
  videoId,
  title,
}: RemoveContributionButtonProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string>();

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
      router.refresh();
    } catch {
      setError("The contribution could not be removed. Please try again.");
      setRemoving(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setRemoving(false);
          setError(undefined);
        }
      }}
    >
      <DialogTrigger
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 text-sm font-semibold text-[#64748b] transition-colors hover:text-red-700 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
        type="button"
      >
        <Trash2 aria-hidden="true" size={14} />
        Remove
      </DialogTrigger>
      <DialogContent className="rounded-2xl ring-0 border border-[#e2e8f0] sm:max-w-115">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-[-0.02em] text-[#202124]">
            Remove your contribution?
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#64748b]">
            This removes your name from{" "}
            <strong className="font-bold text-[#202124]">{title}</strong>. If
            you are the only contributor, the video is unpublished and its
            transcript is deleted.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="m-0 text-sm leading-6 text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter className="border-t-0 bg-transparent p-4">
          <DialogClose
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-bold text-[#202124] transition-colors hover:border-[#cbd5e1] focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={removing}
            type="button"
          >
            Cancel
          </DialogClose>
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={removing}
            onClick={() => void remove()}
            type="button"
          >
            {removing ? "Removing…" : "Remove contribution"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
