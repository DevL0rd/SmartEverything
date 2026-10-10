import { text } from 'node:stream/consumers';
import { onBashDone, onEdit, onEnd, onSnapshot } from './claude-hook/handlers.ts';
import { HookError, parseMode, readStdin } from './claude-hook/input.ts';
import { flushNotices } from './claude-hook/output.ts';
import { onStop } from './claude-hook/stop.ts';

const handlers = {
  edit: onEdit,
  snapshot: onSnapshot,
  'bash-done': onBashDone,
  stop: onStop,
  end: onEnd,
} as const;

try {
  const mode = parseMode(process.argv[2]);
  process.exitCode = await handlers[mode](readStdin(mode, await text(process.stdin)));
  flushNotices();
} catch (error) {
  if (!(error instanceof HookError)) throw error;
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 1;
}
