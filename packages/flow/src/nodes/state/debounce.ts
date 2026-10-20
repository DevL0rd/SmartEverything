import { z } from 'zod';

const ENTRY = z.strictObject({ ticket: z.number().int().nonnegative(), dueAt: z.number() });

export const DEBOUNCE_MEMORY = z.strictObject({
  issued: z.number().int().nonnegative(),
  latest: z.record(z.string(), ENTRY),
});
export type DebounceMemory = z.infer<typeof DEBOUNCE_MEMORY>;

export const EMPTY_DEBOUNCE: DebounceMemory = { issued: 0, latest: {} };

export const DEBOUNCE_ARRIVAL = z.strictObject({
  now: z.number().nonnegative(),
  quietMs: z.number().nonnegative(),
  key: z.string().default(''),
});
export type DebounceArrival = z.input<typeof DEBOUNCE_ARRIVAL>;

export interface DebounceTicket {
  readonly ticket: number;
  readonly dueAt: number;
  readonly memory: DebounceMemory;
}

export function arrive(memory: DebounceMemory | undefined, input: DebounceArrival): DebounceTicket {
  const { now, quietMs, key } = DEBOUNCE_ARRIVAL.parse(input);
  const before = memory ?? EMPTY_DEBOUNCE;
  const ticket = before.issued + 1;
  const dueAt = now + quietMs;
  return {
    ticket,
    dueAt,
    memory: { issued: ticket, latest: { ...before.latest, [key]: { ticket, dueAt } } },
  };
}

export type DebounceSettled =
  | { readonly exit: 'continue'; readonly memory: DebounceMemory }
  | { readonly exit: 'superseded'; readonly memory: DebounceMemory };

export function settle(
  memory: DebounceMemory,
  request: { readonly key?: string; readonly ticket: number },
): DebounceSettled {
  const key = request.key ?? '';
  if (memory.latest[key]?.ticket !== request.ticket) return { exit: 'superseded', memory };
  const remaining = Object.fromEntries(Object.entries(memory.latest).filter(([k]) => k !== key));
  return { exit: 'continue', memory: { issued: memory.issued, latest: remaining } };
}
