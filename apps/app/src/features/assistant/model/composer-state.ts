import { ASSISTANT_TEXT_MAX } from '@smarteverything/domain';

export type SendMode = 'idle' | 'send' | 'stop';

export interface Quote {
  readonly who: string;
  readonly text: string;
}

const COUNTER_SHARE = 0.9;

const QUOTE_LINES_MAX = 6;

export function sendModeOf(filled: boolean, working: boolean, offline: boolean): SendMode {
  if (filled) {
    return 'send';
  }
  return working && !offline ? 'stop' : 'idle';
}

export function showsCounter(length: number): boolean {
  return length >= ASSISTANT_TEXT_MAX * COUNTER_SHARE;
}

export function quotedText(text: string, quote: Quote | null): string {
  if (quote === null) {
    return text;
  }
  const lines = quote.text.trim().split('\n').slice(0, QUOTE_LINES_MAX);
  const block = lines.map((line) => `> ${line}`).join('\n');
  return `${block}\n\n${text}`;
}

export interface SendEffects {
  readonly clear: () => void;
  readonly restore: () => void;
  readonly sent: () => void;
}

export async function sendClearing(
  deliver: () => Promise<boolean>,
  effects: SendEffects,
): Promise<void> {
  effects.clear();
  const delivered = await deliver();
  if (delivered) {
    effects.sent();
  } else {
    effects.restore();
  }
}
