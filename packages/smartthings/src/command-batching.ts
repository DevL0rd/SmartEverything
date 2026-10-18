import type { SmartThingsCommand } from './bindings';
import { COMMAND_RESPONSE } from './rest-schemas';
import { issuePaths, SmartThingsResponseError } from './errors';

export const MAX_COMMANDS_PER_REQUEST = 10;

export const REQUESTS_PER_WINDOW = 12;

export const RATE_WINDOW_MS = 60_000;

export interface QueuedCommand<T> {
  readonly ticket: T;
  readonly commands: readonly SmartThingsCommand[];
}

export interface Batch<T> {
  readonly tickets: readonly T[];
  readonly commands: readonly SmartThingsCommand[];
}

export function takeBatch<T>(queue: readonly QueuedCommand<T>[]): {
  batch: Batch<T>;
  rest: readonly QueuedCommand<T>[];
} {
  const tickets: T[] = [];
  const commands: SmartThingsCommand[] = [];
  let taken = 0;
  for (const entry of queue) {
    const fits = commands.length + entry.commands.length <= MAX_COMMANDS_PER_REQUEST;
    if (!fits && taken > 0) {
      break;
    }
    tickets.push(entry.ticket);
    commands.push(...entry.commands);
    taken += 1;
  }
  return { batch: { tickets, commands }, rest: queue.slice(taken) };
}

export function pruneHistory(history: readonly number[], now: number): readonly number[] {
  return history.filter((sentAt) => sentAt > now - RATE_WINDOW_MS);
}

export function nextRequestAt(history: readonly number[], now: number): number {
  const recent = pruneHistory(history, now);
  if (recent.length < REQUESTS_PER_WINDOW) {
    return now;
  }
  const oldest = Math.min(...recent.slice(-REQUESTS_PER_WINDOW));
  return oldest + RATE_WINDOW_MS;
}

export interface CommandOutcome {
  readonly status: 'ACCEPTED' | 'COMPLETED' | 'FAILED';
}

export function outcomesOf(received: unknown, count: number): readonly CommandOutcome[] {
  const parsed = COMMAND_RESPONSE.safeParse(received);
  if (!parsed.success) {
    throw new SmartThingsResponseError('command response', received, issuePaths(parsed.error));
  }
  if (parsed.data.results.length !== count) {
    throw new SmartThingsResponseError(
      'command response',
      received,
      `expected ${String(count)} results`,
    );
  }
  return parsed.data.results.map((result) => ({ status: result.status }));
}
