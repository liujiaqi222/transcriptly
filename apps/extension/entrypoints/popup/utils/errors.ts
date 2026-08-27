/** Message of the error, or its string form. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether the error message mentions `needle` (e.g. a Chrome runtime
 *  detail such as "Receiving end does not exist"). */
export function errorDetailIncludes(error: unknown, needle: string): boolean {
  return errorMessage(error).includes(needle);
}
