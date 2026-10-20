import { z } from 'zod';

const ENTRY = z.strictObject({
  value: z.number(),
  period: z.string().optional(),
  events: z.array(z.number()),
});

export const COUNTER_MEMORY = z.strictObject({ counts: z.record(z.string(), ENTRY) });
export type CounterMemory = z.infer<typeof COUNTER_MEMORY>;

export const COUNTER_REQUEST = z
  .strictObject({
    now: z.number().nonnegative(),
    op: z.enum(['increment', 'decrement', 'reset', 'set']).default('increment'),
    step: z.number().positive().default(1),
    to: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    wrap: z.boolean().default(false),
    periodKey: z.string().optional(),
    windowMs: z.number().positive().optional(),
    key: z.string().default(''),
  })
  .refine(
    (request) =>
      request.min === undefined || request.max === undefined || request.min <= request.max,
    {
      message: 'the lowest count must not exceed the highest',
    },
  )
  .refine((request) => !request.wrap || (request.min !== undefined && request.max !== undefined), {
    message: 'wrapping needs both a lowest and a highest count',
  })
  .refine((request) => request.op !== 'set' || request.to !== undefined, {
    message: 'setting the count needs a value',
  })
  .refine((request) => request.windowMs === undefined || (!request.wrap && request.op !== 'set'), {
    message: 'a counter over a recent window cannot wrap or be set',
  });
export type CounterRequest = z.input<typeof COUNTER_REQUEST>;

export interface CounterOutcome {
  readonly value: number;
  readonly reachedMax: boolean;
  readonly memory: CounterMemory;
}

type Entry = z.infer<typeof ENTRY>;
type Request = z.output<typeof COUNTER_REQUEST>;

function bounded(next: number, request: Request): number {
  const { min, max, wrap } = request;
  if (max !== undefined && next > max) return wrap ? (min ?? 0) : max;
  if (min !== undefined && next < min) return wrap ? (max ?? 0) : min;
  return next;
}

function inWindow(entry: Entry, request: Request, windowMs: number): Entry {
  const events = entry.events.filter((at) => at > request.now - windowMs);
  const full = request.max !== undefined && events.length >= request.max;
  if (request.op === 'increment' && !full) events.push(request.now);
  if (request.op === 'decrement') events.pop();
  if (request.op === 'reset') events.length = 0;
  return { ...entry, events, value: events.length };
}

function plain(entry: Entry, request: Request): Entry {
  const start = request.min ?? 0;
  if (request.op === 'reset') return { ...entry, value: start };
  if (request.op === 'set') return { ...entry, value: bounded(request.to ?? start, request) };
  const sign = request.op === 'increment' ? 1 : -1;
  return { ...entry, value: bounded(entry.value + sign * request.step, request) };
}

function fresh(entry: Entry | undefined, request: Request): Entry {
  const start: Entry = { value: request.min ?? 0, events: [] };
  const current = entry ?? start;
  const rolled = request.periodKey !== undefined && current.period !== request.periodKey;
  const base = rolled && entry?.period !== undefined ? start : current;
  return request.periodKey === undefined ? base : { ...base, period: request.periodKey };
}

export function counter(memory: CounterMemory | undefined, input: CounterRequest): CounterOutcome {
  const request = COUNTER_REQUEST.parse(input);
  const entry = fresh(memory?.counts[request.key], request);
  const next =
    request.windowMs === undefined
      ? plain(entry, request)
      : inWindow(entry, request, request.windowMs);
  return {
    value: next.value,
    reachedMax: request.max !== undefined && next.value >= request.max,
    memory: { counts: { ...memory?.counts, [request.key]: next } },
  };
}

export function periodKey(period: 'day' | 'week' | 'month', localAsUtc: Date): string {
  if (period === 'month') return localAsUtc.toISOString().slice(0, 7);
  if (period === 'day') return localAsUtc.toISOString().slice(0, 10);
  const monday = new Date(localAsUtc.getTime() - ((localAsUtc.getUTCDay() + 6) % 7) * 86_400_000);
  return `week-${monday.toISOString().slice(0, 10)}`;
}
