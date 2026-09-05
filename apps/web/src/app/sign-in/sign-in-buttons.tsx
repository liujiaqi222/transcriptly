"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { focusRing } from "@/components/landing/shared";
import { authClient } from "@/lib/auth/auth-client";
import { GitHubMark, GoogleMark } from "./provider-icons";

type Provider = "google" | "github";

const providers: Record<Provider, { label: string; icon: React.ReactNode }> = {
  google: {
    label: "Continue with Google",
    icon: <GoogleMark className="size-5" />,
  },
  github: {
    label: "Continue with GitHub",
    icon: <GitHubMark className="size-5" />,
  },
};

export function SignInButtons({ callbackURL }: { callbackURL: string }) {
  const [pendingProvider, setPendingProvider] = useState<Provider>();
  const [error, setError] = useState<string>();

  async function signIn(provider: Provider) {
    setPendingProvider(provider);
    setError(undefined);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL,
      });
      if (result.error) {
        setError("Sign-in could not be started. Please try again.");
        setPendingProvider(undefined);
      }
    } catch {
      setError("Sign-in could not be started. Please try again.");
      setPendingProvider(undefined);
    }
  }

  return (
    <div className="mt-8 space-y-3">
      {(Object.keys(providers) as Provider[]).map((provider) => {
        const pending = pendingProvider === provider;
        return (
          <button
            className={`flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#e2e8f0] bg-white px-4 text-sm font-bold text-[#202124] transition-colors hover:border-[#cbd5e1] hover:bg-[#edf7ff] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
            disabled={pendingProvider !== undefined}
            key={provider}
            onClick={() => signIn(provider)}
            type="button"
          >
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin"
              />
            ) : (
              providers[provider].icon
            )}
            {pending ? "Redirecting…" : providers[provider].label}
          </button>
        );
      })}
      {error ? (
        <p className="pt-1 text-sm leading-6 text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
