"use client";

import { Check, Send, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { focusRing } from "@/components/landing/shared";
import { feedbackReasons } from "@/lib/feedback/validation";

const reasonLabels: Record<(typeof feedbackReasons)[number], string> = {
  "did-not-work": "It didn't work as expected",
  "too-slow": "Too slow or had performance issues",
  "better-alternative": "Found a better alternative",
  "dont-need": "Don't need it anymore",
  "hard-to-use": "Confusing or hard to use",
  "missing-feature": "Missing features I needed",
  other: "Other",
};

/** Placeholder for the follow-up box revealed under each checked reason. */
const reasonPlaceholders: Record<(typeof feedbackReasons)[number], string> = {
  "did-not-work": "e.g., transcripts didn't load, the popup was blank…",
  "too-slow": "Which part felt slow? e.g., capturing, loading transcripts…",
  "better-alternative": "What did you switch to, and what does it do better?",
  "dont-need": "e.g., you only needed it for a one-off project…",
  "hard-to-use": "Which part was confusing?",
  "missing-feature": "Which feature were you missing?",
  other: "Tell us more…",
};

type Reason = (typeof feedbackReasons)[number];
type DetailsByReason = Partial<Record<Reason, string>>;

export function FeedbackForm() {
  const params = useSearchParams();
  const source = params.get("source") === "uninstall" ? "uninstall" : "website";
  const extensionVersion = params.get("version") ?? undefined;
  const [rating, setRating] = useState(0);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [detailsByReason, setDetailsByReason] = useState<DetailsByReason>({});
  const [contactEmail, setContactEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");

  function toggleReason(value: Reason, checked: boolean) {
    setReasons((current) =>
      checked ? [...current, value] : current.filter((r) => r !== value),
    );
    if (!checked) {
      // The follow-up box collapses with its checkbox; drop its text so a
      // hidden value is never silently submitted.
      setDetailsByReason(({ [value]: _removed, ...rest }) => rest);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) return;
    setStatus("sending");
    try {
      const response = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          rating,
          reasons,
          details: detailsByReason,
          contactEmail,
          extensionVersion,
        }),
      });
      setStatus(response.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="border border-[#e2e8f0] bg-white p-8 text-center sm:p-12">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#edf7ff] text-[#0872b9]">
          <Check aria-hidden="true" />
        </div>
        <h2 className="mt-6 font-serif text-3xl font-semibold">
          Thanks for the honest feedback.
        </h2>
        <p className="mt-3 text-[#64748b]">
          Your response helps us make Transcriptly better.
        </p>
      </div>
    );
  }

  return (
    <form
      className="border border-[#e2e8f0] bg-white p-6 sm:p-10"
      onSubmit={submit}
    >
      <fieldset>
        <legend className="text-lg font-bold">
          How would you rate Transcriptly?
        </legend>
        <div className="mt-4 flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              aria-label={`${value} out of 5`}
              aria-pressed={rating === value}
              className={`grid size-11 place-items-center border transition-colors ${focusRing} ${value <= rating ? "border-[#f5c451] bg-[#fff7d8] text-[#b7791f]" : "border-[#e2e8f0] text-[#94a3b8] hover:border-[#147ac9] hover:text-[#1b90ed]"}`}
              key={value}
              onClick={() => setRating(value)}
              type="button"
            >
              <Star
                aria-hidden="true"
                className="size-5"
                fill={value <= rating ? "currentColor" : "none"}
              />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="text-lg font-bold">
          {source === "uninstall"
            ? "What made you uninstall the extension?"
            : "What did not work for you?"}
        </legend>
        <div className="mt-4 space-y-2">
          {feedbackReasons.map((value) => {
            const checked = reasons.includes(value);
            return (
              <div key={value}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium text-[#202124]">
                  <input
                    checked={checked}
                    className="peer sr-only"
                    onChange={(event) =>
                      toggleReason(value, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span
                    aria-hidden="true"
                    className={`grid size-5 shrink-0 place-items-center rounded-[4px] border transition-colors peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-3 peer-focus-visible:outline-[#1b90ed]/40 peer-hover:border-[#147ac9] ${checked ? "border-[#1b90ed] bg-[#1b90ed] text-white" : "border-[#cbd5e1] bg-white"}`}
                  >
                    {checked && (
                      <Check
                        aria-hidden="true"
                        className="size-3.5"
                        strokeWidth={3}
                      />
                    )}
                  </span>
                  {reasonLabels[value]}
                </label>
                {checked && (
                  <input
                    aria-label={`Tell us more (optional) — ${reasonLabels[value]}`}
                    className="mb-2 ml-8 mt-1 min-h-11 w-[calc(100%-2rem)] border border-[#cbd5e1] bg-white px-3 text-sm focus:border-[#1b90ed] focus:outline-2 focus:outline-[#1b90ed]/30"
                    maxLength={2000}
                    onChange={(event) =>
                      setDetailsByReason((current) => ({
                        ...current,
                        [value]: event.target.value,
                      }))
                    }
                    placeholder={reasonPlaceholders[value]}
                    type="text"
                    value={detailsByReason[value] ?? ""}
                  />
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-6 block text-sm font-bold" htmlFor="email">
        Email{" "}
        <span className="font-normal text-[#64748b]">
          (optional, if you'd like a follow up)
        </span>
      </label>
      <input
        className="mt-2 min-h-11 w-full border border-[#cbd5e1] bg-white px-3 text-sm focus:border-[#1b90ed] focus:outline-2 focus:outline-[#1b90ed]/30"
        id="email"
        onChange={(event) => setContactEmail(event.target.value)}
        placeholder="you@example.com"
        type="email"
        value={contactEmail}
      />
      <input
        aria-hidden="true"
        className="hidden"
        name="website"
        tabIndex={-1}
      />

      {status === "error" && (
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          Something went wrong. Please try again.
        </p>
      )}
      <button
        className={`mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#f5c451] px-5 text-sm font-bold text-[#202124] transition-colors hover:bg-[#e7b642] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
        disabled={!rating || status === "sending"}
        type="submit"
      >
        <Send aria-hidden="true" className="size-4" />
        {status === "sending" ? "Sending..." : "Submit feedback"}
      </button>
    </form>
  );
}
