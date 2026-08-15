export function parseTimestamp(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (clock) {
    const hours = clock[1] ? Number(clock[1]) : 0;
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3]);
    const total = hours * 3600 + minutes * 60 + seconds;
    return Number.isFinite(total) && total >= 0 ? total : null;
  }

  const secondsOnly = /^(\d+)$/.exec(trimmed);
  if (secondsOnly) {
    const total = Number(secondsOnly[1]);
    return Number.isFinite(total) && total >= 0 ? total : null;
  }

  return null;
}

export function parseDuration(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(
    raw.trim().toUpperCase(),
  );
  if (!match) return null;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;

  return Number.isFinite(total) && total >= 0 ? total : null;
}
