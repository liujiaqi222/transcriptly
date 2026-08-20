// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountSection,
  type AccountDependencies,
} from "../entrypoints/popup/components/account-section";
import type {
  CloudSessionStatus,
  CloudSignOutStatus,
} from "../shared/messages";

function dependencies(overrides?: {
  getCloudSession?: (
    call: number,
  ) => Promise<CloudSessionStatus | undefined>;
  signOutCloud?: () => Promise<CloudSignOutStatus>;
}): AccountDependencies {
  let call = 0;
  return {
    async getCloudSession() {
      call += 1;
      const result = overrides?.getCloudSession?.(call);
      return (await result) ?? { status: "signed-out" };
    },
    openCloudSignIn: vi.fn().mockResolvedValue(undefined),
    async signOutCloud() {
      return (
        overrides?.signOutCloud?.() ?? Promise.resolve({ status: "signed-out" })
      );
    },
  };
}

describe("account section", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the signed-in email for an existing website session", async () => {
    const deps = dependencies({
      getCloudSession: () =>
        Promise.resolve({ status: "signed-in", email: "user@example.test" }),
    });

    render(<AccountSection deps={deps} pollIntervalMs={10} />);

    await waitFor(() =>
      expect(screen.getByText("user@example.test")).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeTruthy();
  });

  it("shows a sign-in button when signed out, then the email after sign-in completes", async () => {
    let signedIn = false;
    const deps = dependencies({
      getCloudSession: () =>
        Promise.resolve(
          signedIn
            ? { status: "signed-in", email: "user@example.test" }
            : { status: "signed-out" },
        ),
    });

    render(<AccountSection deps={deps} pollIntervalMs={10} />);

    const signIn = await screen.findByRole("button", {
      name: "Sign in to Transcriptly",
    });
    fireEvent.click(signIn);

    await waitFor(() =>
      expect(vi.mocked(deps.openCloudSignIn)).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.getByText(/Waiting for sign-in/),
    ).toBeTruthy();

    signedIn = true;

    await waitFor(() =>
      expect(screen.getByText("user@example.test")).toBeTruthy(),
    );
  });

  it("shows an error state when the cloud is unreachable", async () => {
    const deps = dependencies({
      getCloudSession: () => Promise.resolve({ status: "unavailable" }),
    });

    render(<AccountSection deps={deps} pollIntervalMs={10} />);

    expect(
      await screen.findByText(/Could not reach the Transcriptly cloud/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeTruthy();
  });

  it("returns to signed-out after signing out", async () => {
    let signedIn = true;
    const deps = dependencies({
      getCloudSession: () =>
        Promise.resolve(
          signedIn
            ? { status: "signed-in", email: "user@example.test" }
            : { status: "signed-out" },
        ),
    });

    render(<AccountSection deps={deps} pollIntervalMs={10} />);

    const signOut = await screen.findByRole("button", { name: "Sign out" });
    signedIn = false;
    fireEvent.click(signOut);

    await screen.findByRole("button", { name: "Sign in to Transcriptly" });
  });

  it("shows a sign-out error when sign-out fails", async () => {
    const deps = dependencies({
      getCloudSession: () =>
        Promise.resolve({ status: "signed-in", email: "user@example.test" }),
      signOutCloud: () => Promise.resolve({ status: "error" }),
    });

    render(<AccountSection deps={deps} pollIntervalMs={10} />);

    const signOut = await screen.findByRole("button", { name: "Sign out" });
    fireEvent.click(signOut);

    expect(await screen.findByText(/Sign out failed/)).toBeTruthy();
  });
});
