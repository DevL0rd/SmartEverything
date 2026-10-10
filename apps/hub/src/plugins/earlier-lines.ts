import type { CallText } from '../store/repositories/assistant-chat';

const MINUTE_MS = 60_000;
const SOON_MINUTES = 120;
const MINUTES_PER_HOUR = 60;
const MOMENT_LENGTH = 16;

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
      `[${line.at.slice(0, MOMENT_LENGTH).replace('T', ' ')} UTC, ${ageOf(line.at, now)}] ${line.text}`,
  );
  return [HEADING, ...stamped].join('\n');
}
