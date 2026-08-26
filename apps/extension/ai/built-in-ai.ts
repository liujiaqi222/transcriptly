/**
 * Chrome built-in AI (Prompt API / Gemini Nano) adapter (#78).
 *
 * The browser surface is intentionally narrowed to `BuiltInAi`: the
 * Playground page and its tests only ever see this seam, so feature
 * absence, download progress, streaming, thought summaries, failure,
 * and abort behavior stay deterministic in automated tests. Nothing
 * here touches Capture, Local Markdown, the Public Contribution flow,
 * or the database - built-in AI is a standalone capability whose
 * absence must never affect them.
 */

/** Prompt API availability, as reported by `LanguageModel.availability()`. */
export type BuiltInAiAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";

/** `downloadprogress` event payload from the model-creation monitor. */
export interface BuiltInAiDownloadProgress {
  loaded: number;
  total: number;
}

/** Monitor passed to `create()`; emits download progress events. */
export interface BuiltInAiModelMonitor {
  addEventListener(
    type: "downloadprogress",
    listener: (event: BuiltInAiDownloadProgress) => void,
  ): void;
}

/**
 * One streamed piece of a response. `thought` marks a thought-summary
 * chunk (the model's visible reasoning) as opposed to answer text.
 */
export interface BuiltInAiStreamChunk {
  text: string;
  thought: boolean;
}

/** A live Prompt API session. Destroyed on page teardown (#78). */
export interface BuiltInAiSession {
  /** Streams a response as normalized chunks; supports AbortSignal. */
  promptStreaming(
    input: string,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<BuiltInAiStreamChunk>>;
  destroy(): void;
}

export interface BuiltInAiCreateOptions {
  monitor?(monitor: BuiltInAiModelMonitor): void;
  signal?: AbortSignal;
  /**
   * Ask the model for thought summaries. Web IDL dictionaries ignore
   * unrecognized members, so older Chrome builds without thought
   * summaries simply receive (and drop) this option - never an error.
   */
  thoughtSummaryMode?: "concise" | "detailed";
}

/** The entire browser surface the Playground depends on. */
export interface BuiltInAi {
  availability(): Promise<BuiltInAiAvailability>;
  create(options?: BuiltInAiCreateOptions): Promise<BuiltInAiSession>;
}

/** Structural subset of Chrome's `LanguageModel` global. */
interface LanguageModelGlobal {
  availability(): Promise<BuiltInAiAvailability>;
  create(options?: BuiltInAiCreateOptions): Promise<BuiltInAiSession>;
}

function isLanguageModel(value: unknown): value is LanguageModelGlobal {
  // Web IDL exposes `LanguageModel` as an interface object (a callable
  // constructor with static methods), so Chrome reports its type as
  // `function`. Object-shaped fakes are also useful for deterministic tests.
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return false;
  }
  const candidate = value as Partial<LanguageModelGlobal>;
  return (
    typeof candidate.availability === "function" &&
    typeof candidate.create === "function"
  );
}

/**
 * Native `promptStreaming` chunks vary by Chrome version: thought
 * summaries arrive as `{ text, thought }` objects while plain text
 * chunks may be bare strings. Normalize both into the seam's shape.
 */
function normalizeChunk(chunk: unknown): BuiltInAiStreamChunk {
  if (typeof chunk === "string") return { text: chunk, thought: false };
  const candidate = (chunk ?? {}) as { text?: unknown; thought?: unknown };
  return {
    text: typeof candidate.text === "string" ? candidate.text : "",
    thought: candidate.thought === true,
  };
}

function normalizeStream(
  stream: ReadableStream<unknown>,
): ReadableStream<BuiltInAiStreamChunk> {
  return stream.pipeThrough(
    new TransformStream<unknown, BuiltInAiStreamChunk>({
      transform(chunk, controller) {
        controller.enqueue(normalizeChunk(chunk));
      },
    }),
  );
}

/**
 * Returns the Prompt API adapter for a global scope, or `undefined` when
 * the browser does not expose `LanguageModel` at all (feature absence).
 * Never throws, so a missing API degrades to the "unsupported" page state.
 */
export function getBuiltInAi(scope: object): BuiltInAi | undefined {
  const model = (scope as { LanguageModel?: unknown }).LanguageModel;
  if (!isLanguageModel(model)) return undefined;
  return {
    availability: () => model.availability(),
    create: async (options) => {
      const session = await model.create(options);
      return {
        // `await` accepts both the synchronous ReadableStream the spec
        // defines and a promise, in case Chrome returns one.
        promptStreaming: async (input, promptOptions) => {
          const stream = await session.promptStreaming(input, promptOptions);
          return normalizeStream(stream);
        },
        destroy: () => session.destroy(),
      };
    },
  };
}
