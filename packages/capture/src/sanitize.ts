export function sanitizeText(input: string): string {
  let text = input;

  text = text.replace(/\r\n?/g, "\n");
  // Strip control characters (except newline) and the delete character.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Strip invisible/zero-width characters and Unicode line/paragraph separators.
  text = text.replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, "");
  // Collapse horizontal whitespace runs to a single space, preserving newlines.
  text = text.replace(/[ \t]+/g, " ");
  // Trim leading/trailing horizontal whitespace on every line.
  text = text.replace(/^[ \t]+/gm, "").replace(/[ \t]+$/gm, "");

  return text.trim();
}

const SOUND_TAG_BRACKETS = /\[[^\][\n]*\]/gu;
const MUSIC_NOTE_CHARACTERS = /[\u266A\u266B]/gu;

/**
 * Removes YouTube sound-event annotations that auto-captions inject into
 * transcript text ("[Music]", "[Applause]", "[音乐]") plus the standalone
 * ♪/♫ note characters used around lyric lines. Because caption text is
 * speech, a bracketed span counts as a tag when it holds letters but no
 * digits — digit-bearing or punctuation-only brackets stay untouched.
 * Each removal leaves a space so flanking words cannot fuse, and the
 * doubled whitespace is collapsed afterwards.
 */
export function stripSoundEventTags(input: string): string {
  const withoutTags = input
    .replace(SOUND_TAG_BRACKETS, (tag) => {
      const content = tag.slice(1, -1).trim();
      if (content.length === 0) return tag;
      if (/\d/u.test(content)) return tag;
      if (!/\p{L}/u.test(content)) return tag;
      return " ";
    })
    .replace(MUSIC_NOTE_CHARACTERS, " ");

  return withoutTags.replace(/[ \t]{2,}/g, " ").trim();
}
