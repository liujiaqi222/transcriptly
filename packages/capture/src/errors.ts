export type CaptureFailureKind =
  | "not-a-watch-page"
  | "no-transcript"
  | "malformed-segments"
  | "extraction-failed";

export class CaptureError extends Error {
  readonly kind: CaptureFailureKind;

  constructor(kind: CaptureFailureKind, message: string) {
    super(message);
    this.name = "CaptureError";
    this.kind = kind;
  }
}

export interface CaptureFailure {
  kind: CaptureFailureKind;
  message: string;
}

export function toCaptureFailure(error: unknown): CaptureFailure {
  if (error instanceof CaptureError) {
    return { kind: error.kind, message: error.message };
  }
  if (error instanceof Error) {
    return { kind: "extraction-failed", message: error.message };
  }
  return { kind: "extraction-failed", message: String(error) };
}
