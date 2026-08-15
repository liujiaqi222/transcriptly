export function sanitizeText(input: string): string {
  let text = input;

  text = text.replace(/\r\n?/g, "\n");
  // Strip control characters (except newline) and the delete character.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Collapse horizontal whitespace runs to a single space, preserving newlines.
  text = text.replace(/[ \t]+/g, " ");
  // Trim leading/trailing horizontal whitespace on every line.
  text = text.replace(/^[ \t]+/gm, "").replace(/[ \t]+$/gm, "");

  return text.trim();
}
