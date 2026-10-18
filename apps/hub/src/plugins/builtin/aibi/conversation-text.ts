import type { DeskAnswer } from './conversation-types';
import type { BodyOutcome } from './turn';
import { messageOf } from '@smarteverything/logging';

export const WAITING =
  '[This is waiting for them. First do what they ask now; then mention briefly that you have an update and tell it if they want.]';

export const FAREWELL =
  /^(?:ok(?:ay)?[,.!]?\s*)?(?:good ?bye|bye(?: for now)?|see you(?: later| soon)?|talk (?:to you )?(?:later|soon)|take care|catch you later|later)\b[^?]{0,40}$/i;

export const TOO_LATE: Readonly<Record<BodyOutcome['kind'], string>> = {
  look: 'Too late for this turn: call look before saying anything, then wait for the photo.',
  action: 'Not done: you were already talking.',
};

export function combined(notes: readonly string[]): string {
  const joined = notes.join('\n\n');
  return notes.length > 1
    ? `${joined}\n\n[Several updates arrived together: tell them as one short message that keeps every important detail.]`
    : joined;
}

export function failedTool(error: unknown): DeskAnswer {
  return { result: { error: messageOf(error) } };
}
