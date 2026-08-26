// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BuiltInAiAvailability,
  BuiltInAiCreateOptions,
} from "../ai/built-in-ai";
import { getBuiltInAi } from "../ai/built-in-ai";
import {
  PlaygroundApp,
  type PlaygroundDependencies,
} from "../entrypoints/playground/app";

/**
 * Fake browser API harness (#78): the page only ever sees the
 * `getBuiltInAi` seam, so these tests drive a fake `LanguageModel`
 * global and keep unsupported, downloadable, success, failure, and
 * aborted states deterministic.
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function abortError(): DOMException {
  return new DOMException("The request was aborted.", "AbortError");
}

/** One controllable Prompt API session. */
class FakeSession {
  destroyed = false;
  lastInput?: string;
  lastSignal?: AbortSignal;
  private current?: Deferred<string>;

  prompt = vi.fn((input: string, options?: { signal?: AbortSignal }) => {
    this.lastInput = input;
    this.lastSignal = options?.signal;
    const next = deferred<string>();
    this.current = next;
    // A well-behaved abortable API rejects immediately when handed an
    // already-aborted signal (Stop can race ahead of the prompt call).
    if (options?.signal?.aborted) {
      next.reject(abortError());
      return next.promise;
    }
    options?.signal?.addEventListener("abort", () => {
      next.reject(abortError());
    });
    return next.promise;
  });

  resolveAnswer(text: string) {
    this.current?.resolve(text);
  }

  rejectAnswer(error: unknown) {
    this.current?.reject(error);
  }

  destroy() {
    this.destroyed = true;
  }
}

/** Monitor handed to `create()`; emits downloadprogress events. */
class FakeMonitor {
  private listeners: ((event: { loaded: number; total: number }) => void)[] =
    [];

  addEventListener(
    _type: "downloadprogress",
    listener: (event: { loaded: number; total: number }) => void,
  ) {
    this.listeners.push(listener);
  }

  emit(loaded: number, total: number) {
    for (const listener of this.listeners) listener({ loaded, total });
  }
}

function createFakeModel(options: {
  availability?: BuiltInAiAvailability;
  create?: (
    monitor: FakeMonitor,
    createOptions?: BuiltInAiCreateOptions,
  ) => Promise<FakeSession>;
}) {
  const monitors: FakeMonitor[] = [];
  const createOptions: (BuiltInAiCreateOptions | undefined)[] = [];
  const sessions: FakeSession[] = [];
  const languageModel = {
    availability: vi.fn(
      async (): Promise<BuiltInAiAvailability> =>
        options.availability ?? "available",
    ),
    create: vi.fn(
      async (
        createOptionsArg?: BuiltInAiCreateOptions,
      ): Promise<FakeSession> => {
        createOptions.push(createOptionsArg);
        const monitor = new FakeMonitor();
        monitors.push(monitor);
        createOptionsArg?.monitor?.(monitor);
        const session = await (options.create?.(monitor, createOptionsArg) ??
          Promise.resolve(new FakeSession()));
        sessions.push(session);
        return session;
      },
    ),
  };
  return { languageModel, monitors, createOptions, sessions };
}

function playgroundDeps(
  fake: ReturnType<typeof createFakeModel>,
): PlaygroundDependencies {
  return { ai: getBuiltInAi({ LanguageModel: fake.languageModel }) };
}

function onlySession(fake: ReturnType<typeof createFakeModel>): FakeSession {
  const session = fake.sessions[0];
  if (!session) throw new Error("expected a created session");
  return session;
}

function onlyMonitor(fake: ReturnType<typeof createFakeModel>): FakeMonitor {
  const monitor = fake.monitors[0];
  if (!monitor) throw new Error("expected a model monitor");
  return monitor;
}

afterEach(cleanup);

describe("getBuiltInAi seam", () => {
  it("returns undefined when the browser has no LanguageModel", () => {
    expect(getBuiltInAi({})).toBeUndefined();
    expect(getBuiltInAi({ LanguageModel: undefined })).toBeUndefined();
    expect(
      getBuiltInAi({ LanguageModel: { availability: "nope" } }),
    ).toBeUndefined();
  });

  it("delegates availability and create to the global", async () => {
    const fake = createFakeModel({ availability: "downloadable" });
    const ai = getBuiltInAi({ LanguageModel: fake.languageModel });
    if (!ai) throw new Error("expected an adapter");

    expect(await ai.availability()).toBe("downloadable");
    const session = await ai.create({
      monitor: (monitor) => {
        monitor.addEventListener("downloadprogress", () => {});
      },
    });
    expect(session).toBe(fake.sessions[0]);
    expect(fake.languageModel.create).toHaveBeenCalledTimes(1);
    expect(fake.monitors).toHaveLength(1);
  });
});

describe("AI Playground states (#78)", () => {
  it("explains the unsupported state when the feature is absent", async () => {
    render(<PlaygroundApp deps={{ ai: undefined }} />);

    expect(
      await screen.findByText(/not available in this browser/i),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare model" })).toBeNull();
    expect(screen.queryByLabelText("Prompt")).toBeNull();
  });

  it("explains the unavailable state and offers no download", async () => {
    const fake = createFakeModel({ availability: "unavailable" });
    render(<PlaygroundApp deps={playgroundDeps(fake)} />);

    expect(await screen.findByText(/not eligible yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare model" })).toBeNull();
    expect(fake.languageModel.create).not.toHaveBeenCalled();
  });

  it("downloads the model only from an explicit user action and shows progress", async () => {
    const gate = deferred<FakeSession>();
    const fake = createFakeModel({
      availability: "downloadable",
      create: (monitor) => {
        monitor.emit(0.25, 1);
        return gate.promise;
      },
    });
    render(<PlaygroundApp deps={playgroundDeps(fake)} />);

    const prepare = await screen.findByRole("button", {
      name: "Prepare model",
    });
    // Creation must be user-triggered, never on mount (#78 AC).
    expect(fake.languageModel.create).not.toHaveBeenCalled();

    fireEvent.click(prepare);
    const progress = screen.getByRole("progressbar") as HTMLProgressElement;
    expect(progress.value).toBe(0.25);

    onlyMonitor(fake).emit(0.5, 1);
    await waitFor(() => expect(progress.value).toBe(0.5));

    const session = new FakeSession();
    gate.resolve(session);
    await screen.findByLabelText("Prompt");
    expect(fake.languageModel.create).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the error state when preparation fails, then recovers on retry", async () => {
    let fail = true;
    const fake = createFakeModel({
      availability: "downloadable",
      create: () => {
        if (fail) return Promise.reject(new Error("disk full"));
        return Promise.resolve(new FakeSession());
      },
    });
    render(<PlaygroundApp deps={playgroundDeps(fake)} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Prepare model" }),
    );
    expect(await screen.findByText("disk full")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();

    fail = false;
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    // The re-check finds the model still downloadable; a second explicit
    // prepare succeeds and opens the prompt surface.
    fireEvent.click(
      await screen.findByRole("button", { name: "Prepare model" }),
    );
    await screen.findByLabelText("Prompt");
  });
});

describe("AI Playground prompt flow (#78)", () => {
  async function renderReady() {
    const fake = createFakeModel({ availability: "available" });
    render(<PlaygroundApp deps={playgroundDeps(fake)} />);
    await screen.findByLabelText("Prompt");
    return { fake };
  }

  it("runs a prompt and shows the response", async () => {
    const { fake } = await renderReady();

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Say hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(fake.languageModel.create).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    const session = onlySession(fake);
    expect(session.prompt).toHaveBeenCalled();
    expect(session.lastInput).toBe("Say hi");
    expect(session.lastSignal).toBeInstanceOf(AbortSignal);

    session.resolveAnswer("Hello from Gemini Nano!");
    expect(await screen.findByText("Hello from Gemini Nano!")).toBeTruthy();
    expect(screen.queryByText(/Running…/)).toBeNull();

    // The run's abort resource is released on completion.
    expect(session.lastSignal?.aborted).toBe(false);
  });

  it("shows the failure when the prompt rejects", async () => {
    const { fake } = await renderReady();

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Explode" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    onlySession(fake).rejectAnswer(new Error("model misbehaved"));
    expect(await screen.findByText("model misbehaved")).toBeTruthy();
    // Run is usable again after a failure.
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("stops an in-flight request via the abort signal", async () => {
    const { fake } = await renderReady();

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Long thought" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByText(/Running…/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("Stopped.")).toBeTruthy();
    expect(screen.queryByText(/Running…/)).toBeNull();
    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    expect(onlySession(fake).lastSignal?.aborted).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the prompt and the response", async () => {
    const { fake } = await renderReady();

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Say hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    onlySession(fake).resolveAnswer("Hello!");
    await screen.findByText("Hello!");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByLabelText("Prompt")).toHaveProperty("value", "");
    expect(screen.queryByText("Hello!")).toBeNull();
    expect(screen.getByText(/answer will appear here/i)).toBeTruthy();
  });
});

describe("AI Playground cleanup (#78)", () => {
  it("destroys the session and aborts the run on unmount", async () => {
    const fake = createFakeModel({ availability: "available" });
    const view = render(<PlaygroundApp deps={playgroundDeps(fake)} />);
    await screen.findByLabelText("Prompt");

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Pending" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    const session = onlySession(fake);

    view.unmount();

    expect(session.destroyed).toBe(true);
    expect(session.lastSignal?.aborted).toBe(true);
  });

  it("destroys the session on pagehide (tab close)", async () => {
    const fake = createFakeModel({ availability: "available" });
    render(<PlaygroundApp deps={playgroundDeps(fake)} />);
    await screen.findByLabelText("Prompt");

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Pending" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    const session = onlySession(fake);

    fireEvent(window, new Event("pagehide"));

    expect(session.destroyed).toBe(true);
    expect(session.lastSignal?.aborted).toBe(true);
  });

  it("aborts a pending model download on pagehide", async () => {
    const gate = deferred<FakeSession>();
    const fake = createFakeModel({
      availability: "downloadable",
      create: (_monitor, createOptions) => {
        createOptions?.signal?.addEventListener("abort", () => {
          gate.reject(abortError());
        });
        return gate.promise;
      },
    });
    render(<PlaygroundApp deps={playgroundDeps(fake)} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Prepare model" }),
    );
    fireEvent(window, new Event("pagehide"));

    await expect(gate.promise).rejects.toBeInstanceOf(DOMException);
  });
});
