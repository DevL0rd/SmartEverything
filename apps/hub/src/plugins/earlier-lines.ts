import type { CallText } from '../store/repositories/assistant-chat';

const MINUTE_MS = 60_000;
const SOON_MINUTES = 120;
const MINUTES_PER_HOUR = 60;
const MOMENT_LENGTH = 16;
const MAX_LINE_CHARS = 400;
export const EARLIER_BLOCK_CHARS = 8000;
const CUT = '…';

export const FIRST_CONVERSATION = 'This is your first conversation.';

const HEADING =
  'What was said before in earlier conversations (oldest first; continue naturally, do not repeat it):';

function ageOf(at: string, now: Date): string {
  const minutes = Math.round((now.getTime() - Date.parse(at)) / MINUTE_MS);
  if (minutes < 1) {
    return 'just now';
  }
  return minutes < SOON_MINUTES
    ? `${String(minutes)} min ago`
    : `${String(Math.round(minutes / MINUTES_PER_HOUR))} h ago`;
}

function shortened(text: string): string {
  return text.length <= MAX_LINE_CHARS
    ? text
    : `${text.slice(0, MAX_LINE_CHARS - CUT.length)}${CUT}`;
}

function newestWithin(lines: readonly string[]): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const line of [...lines].reverse()) {
    used += line.length + 1;
    if (used > EARLIER_BLOCK_CHARS && kept.length > 0) {
      break;
    }
    kept.unshift(line);
  }
  return kept;
}

export function earlierBlock(rows: readonly CallText[], limit: number, now: Date): string | null {
  const lines = [...rows]
    .reverse()
    .flatMap((row) =>
      row.text
        .split('\n')
        .filter((text) => text !== '')
        .map((text) => ({ at: row.at, text })),
    )
    .slice(-limit);
  if (lines.length === 0) {
    return null;
  }
  const stamped = lines.map(
    (line) =>
      `[${line.at.slice(0, MOMENT_LENGTH).replace('T', ' ')} UTC, ${ageOf(line.at, now)}] ${shortened(line.text)}`,
  );
  return [HEADING, ...newestWithin(stamped)].join('\n');
}
