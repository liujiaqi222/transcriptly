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
  BuiltInAiStreamChunk,
} from "../ai/built-in-ai";
import { getBuiltInAi } from "../ai/built-in-ai";
import {
  PlaygroundApp,
  type PlaygroundDependencies,
} from "../entrypoints/playground/app";

/**
 * Fake browser API harness (#78): the page only ever sees the
 * `getBuiltInAi` seam, so these tests drive a fake `LanguageModel`
 * global and keep unsupported, downloadable, streaming, thought,
 * failure, and aborted states deterministic.
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

/**
 * One controllable streaming Prompt API session. `promptStreaming`
 * hands back a real ReadableStream the test drives chunk by chunk, so
 * the page's streaming loop runs exactly as in production.
 */
class FakeSession {
  destroyed = false;
  lastInput?: string;
  lastSignal?: AbortSignal;
  private controller?: ReadableStreamDefaultController<BuiltInAiStreamChunk>;
  private queued: BuiltInAiStreamChunk[] = [];

  promptStreaming = vi.fn(
    (input: string, options?: { signal?: AbortSignal }) => {
      this.lastInput = input;
      this.lastSignal = options?.signal;
      const signal = options?.signal;
      const queued = this.queued;
      return new ReadableStream<BuiltInAiStreamChunk>({
        start: (controller) => {
          // A well-behaved abortable stream errors immediately when
          // handed an already-aborted signal (Stop can race ahead of
          // the promptStreaming call).
          if (signal?.aborted) {
            controller.error(abortError());
            return;
          }
          signal?.addEventListener("abort", () => {
            controller.error(abortError());
          });
          this.controller = controller;
          for (const chunk of queued) controller.enqueue(chunk);
        },
      });
    },
  );

  /** Stream one chunk (also replayed into later-started streams). */
  emit(chunk: BuiltInAiStreamChunk) {
    this.queued.push(chunk);
    this.controller?.enqueue(chunk);
  }

  finish() {
    this.controller?.close();
  }

  fail(error: unknown) {
    this.controller?.error(error);
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

/** Starts a run and waits until its stream is live and readable. */
async function startRun(input: string) {
  fireEvent.change(screen.getByLabelText("Prompt"), {
    target: { value: input },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
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

  it("wraps create, promptStreaming, and destroy of the global", async () => {
    const fake = createFakeModel({ availability: "downloadable" });
    const ai = getBuiltInAi({ LanguageModel: fake.languageModel });
    if (!ai) throw new Error("expected an adapter");

    expect(await ai.availability()).toBe("downloadable");
    const session = await ai.create({
      monitor: (monitor) => {
        monitor.addEventListener("downloadprogress", () => {});
      },
    });
    expect(fake.languageModel.create).toHaveBeenCalledTimes(1);
    expect(fake.monitors).toHaveLength(1);

    await session.promptStreaming("hi");
    expect(onlySession(fake).promptStreaming).toHaveBeenCalledWith(
      "hi",
      undefined,
    );

    session.destroy();
    expect(onlySession(fake).destroyed).toBe(true);
  });

  it("normalizes native stream chunk shapes", async () => {
    // Native chunks vary by Chrome version: bare strings for plain
    // text, `{ text, thought }` objects for thought summaries.
    const nativeSession = {
      promptStreaming: () =>
        new ReadableStream<unknown>({
          start(controller) {
            controller.enqueue("plain text ");
            controller.enqueue({ text: "reasoned", thought: true });
            controller.close();
          },
        }),
      destroy: () => undefined,
    };
    const languageModel = {
      availability: async () => "available" as const,
      create: async () => nativeSession,
    };

    const ai = getBuiltInAi({ LanguageModel: languageModel });
    const session = await ai?.create();
    const stream = await session?.promptStreaming("hi");
    if (!stream) throw new Error("expected a stream");

    const reader = stream.getReader();
    const chunks: BuiltInAiStreamChunk[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks).toEqual([
      { text: "plain text ", thought: false },
      { text: "reasoned", thought: true },
    ]);
  });

  it("accepts Chrome's callable LanguageModel interface object", async () => {
    const fake = createFakeModel({ availability: "available" });
    const languageModel = Object.assign(
      function LanguageModel() {},
      fake.languageModel,
    );

    const ai = getBuiltInAi({ LanguageModel: languageModel });

    expect(ai).toBeDefined();
    expect(await ai?.availability()).toBe("available");
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

  /** Waits for the run's session and live stream. */
  async function liveSession(fake: ReturnType<typeof createFakeModel>) {
    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    const session = onlySession(fake);
    await waitFor(() => expect(session.promptStreaming).toHaveBeenCalled());
    return session;
  }

  it("streams the response as chunks arrive and requests thought summaries", async () => {
    const { fake } = await renderReady();

    await startRun("Say hi");

    expect(fake.languageModel.create).toHaveBeenCalledTimes(1);
    expect(fake.createOptions[0]?.thoughtSummaryMode).toBe("concise");
    const session = await liveSession(fake);
    expect(session.lastInput).toBe("Say hi");
    expect(session.lastSignal).toBeInstanceOf(AbortSignal);

    session.emit({ text: "Hello ", thought: false });
    await screen.findByText(/Hello/);
    // Partial text is visible while the run is still streaming.
    expect(screen.getByText(/Running…/)).toBeTruthy();

    session.emit({ text: "from Gemini Nano!", thought: false });
    session.finish();

    expect(await screen.findByText("Hello from Gemini Nano!")).toBeTruthy();
    expect(screen.queryByText(/Running…/)).toBeNull();
    // The run's abort resource is released without aborting on success.
    expect(session.lastSignal?.aborted).toBe(false);
  });

  it("streams thought summaries into a separate Thinking panel", async () => {
    const { fake } = await renderReady();

    await startRun("Think hard");
    const session = await liveSession(fake);

    session.emit({ text: "Weighing options…", thought: true });
    expect(await screen.findByText("Weighing options…")).toBeTruthy();
    expect(screen.getByText("Thinking")).toBeTruthy();

    session.emit({ text: "Answer!", thought: false });
    expect(await screen.findByText("Answer!")).toBeTruthy();
    session.finish();

    // The answer stays separate from the reasoning panel.
    expect(screen.getByText("Response")).toBeTruthy();
  });

  it("turns the output-limit notice into a friendly note", async () => {
    const { fake } = await renderReady();

    await startRun("Write a lot");
    const session = await liveSession(fake);

    session.emit({ text: "Short answer. ", thought: false });
    session.emit({
      text: "The response exceeded output limits and was truncated.",
      thought: false,
    });
    session.finish();

    expect(await screen.findByText("Short answer.")).toBeTruthy();
    // The raw notice is stripped from the response…
    expect(screen.queryByText(/exceeded output limits/)).toBeNull();
    // …and replaced with an explanation.
    expect(await screen.findByText(/output token limit/i)).toBeTruthy();
  });

  it("shows the failure when the stream errors", async () => {
    const { fake } = await renderReady();

    await startRun("Explode");
    const session = await liveSession(fake);

    session.fail(new Error("model misbehaved"));
    expect(await screen.findByText("model misbehaved")).toBeTruthy();
    // Run is usable again after a failure.
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("stops an in-flight stream via the abort signal and keeps the partial answer", async () => {
    const { fake } = await renderReady();

    await startRun("Long thought");
    const session = await liveSession(fake);
    expect(screen.getByText(/Running…/)).toBeTruthy();

    session.emit({ text: "Partial answer", thought: false });
    expect(await screen.findByText(/Partial answer/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("Stopped.")).toBeTruthy();
    expect(screen.queryByText(/Running…/)).toBeNull();
    expect(screen.getByText(/Partial answer/)).toBeTruthy();
    expect(session.lastSignal?.aborted).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the prompt, thinking, and the response", async () => {
    const { fake } = await renderReady();

    await startRun("Say hi");
    const session = await liveSession(fake);
    session.emit({ text: "Pondering…", thought: true });
    session.emit({ text: "Hello!", thought: false });
    session.finish();
    await screen.findByText("Hello!");
    await screen.findByText("Pondering…");

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByLabelText("Prompt")).toHaveProperty("value", "");
    expect(screen.queryByText("Hello!")).toBeNull();
    expect(screen.queryByText("Pondering…")).toBeNull();
    expect(screen.queryByText("Thinking")).toBeNull();
    expect(screen.getByText(/answer will appear here/i)).toBeTruthy();
  });
});

describe("AI Playground cleanup (#78)", () => {
  it("destroys the session and aborts the run on unmount", async () => {
    const fake = createFakeModel({ availability: "available" });
    const view = render(<PlaygroundApp deps={playgroundDeps(fake)} />);
    await screen.findByLabelText("Prompt");

    await startRun("Pending");
    const session = await waitFor(async () => {
      expect(fake.sessions).toHaveLength(1);
      return onlySession(fake);
    });
    await waitFor(() => expect(session.promptStreaming).toHaveBeenCalled());

    view.unmount();

    expect(session.destroyed).toBe(true);
    expect(session.lastSignal?.aborted).toBe(true);
  });

  it("destroys the session on pagehide (tab close)", async () => {
    const fake = createFakeModel({ availability: "available" });
    render(<PlaygroundApp deps={playgroundDeps(fake)} />);
    await screen.findByLabelText("Prompt");

    await startRun("Pending");
    await waitFor(() => expect(fake.sessions).toHaveLength(1));
    const session = onlySession(fake);
    await waitFor(() => expect(session.promptStreaming).toHaveBeenCalled());

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
