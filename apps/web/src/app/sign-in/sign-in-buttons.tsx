"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";

type Provider = "google" | "github";

const providerLabels: Record<Provider, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

export function SignInButtons() {
  const [pendingProvider, setPendingProvider] = useState<Provider>();
  const [error, setError] = useState<string>();

  async function signIn(provider: Provider) {
    setPendingProvider(provider);
    setError(undefined);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/saved",
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
      {(["google", "github"] as const).map((provider) => (
        <button
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pendingProvider !== undefined}
          key={provider}
          onClick={() => signIn(provider)}
          type="button"
        >
          {pendingProvider === provider
            ? "Redirecting…"
            : providerLabels[provider]}
        </button>
      ))}
      {error ? (
        <p className="pt-1 text-sm leading-6 text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
