export const LOOP_LIMIT = 20;

export const LOOP_WINDOW_MS = 10 * 60_000;

export const REPORT_TEXT_MAX = 8000;

export const PAUSED_TEXT = `Paused: the AIs messaged each other ${String(LOOP_LIMIT)} times in ${String(LOOP_WINDOW_MS / 60_000)} minutes. Reply here to let them continue.`;

export const DEADLOCK_TEXT = 'That chat is waiting for you; send without waiting.';

export const WORKER_TEXT =
  'That is a Claude Code or Codex worker chat; message it with worker_send.';

export const TOO_MANY_HOPS = 'Too many hand-offs between AIs; ask the person how to go on.';
