import { z } from 'zod';

export const TIMER_SLOT_PREFIX = 'timer:';

export const TIMER_MEMORY = z.strictObject({
  deadline: z.number().optional(),
  remainingMs: z.number().nonnegative().optional(),
});
export type TimerMemory = z.infer<typeof TIMER_MEMORY>;

export const TIMER_REQUEST = z
  .strictObject({
    now: z.number().nonnegative(),
    op: z.enum(['start', 'restart', 'extend', 'pause', 'resume', 'cancel']).default('start'),
    durationMs: z.number().positive().optional(),
  })
  .refine(
    (request) =>
      !['start', 'restart', 'extend'].includes(request.op) || request.durationMs !== undefined,
    { message: 'starting, restarting or extending a timer needs a duration' },
  );
export type TimerRequest = z.input<typeof TIMER_REQUEST>;

export interface TimerOutcome {
  readonly running: boolean;
  readonly remainingMs: number;
  readonly wakeAt: number | null;
  readonly memory: TimerMemory;
}

type Request = z.output<typeof TIMER_REQUEST>;

const IDLE: TimerMemory = {};

function settled(memory: TimerMemory | undefined, now: number): TimerMemory {
  if (memory?.deadline !== undefined && memory.deadline <= now) return IDLE;
  return memory ?? IDLE;
}

function running(deadline: number): TimerMemory {
  return { deadline };
}

type Step = (memory: TimerMemory, now: number, durationMs: number) => TimerMemory;

const STEPS: Readonly<Record<Request['op'], Step>> = {
  start: (memory, now, durationMs) =>
    memory.deadline !== undefined || memory.remainingMs !== undefined
      ? memory
      : running(now + durationMs),
  restart: (_memory, now, durationMs) => running(now + durationMs),
  extend: (memory, now, durationMs) => {
    if (memory.deadline !== undefined) return running(memory.deadline + durationMs);
    if (memory.remainingMs !== undefined) return { remainingMs: memory.remainingMs + durationMs };
    return running(now + durationMs);
  },
  pause: (memory, now) =>
    memory.deadline === undefined ? memory : { remainingMs: memory.deadline - now },
  resume: (memory, now) =>
    memory.remainingMs === undefined ? memory : running(now + memory.remainingMs),
  cancel: () => IDLE,
};

function apply(memory: TimerMemory, request: Request): TimerMemory {
  return STEPS[request.op](memory, request.now, request.durationMs ?? 0);
}

export function timer(memory: TimerMemory | undefined, input: TimerRequest): TimerOutcome {
  const request = TIMER_REQUEST.parse(input);
  const next = apply(
    settled(memory === undefined ? undefined : TIMER_MEMORY.parse(memory), request.now),
    request,
  );
  return {
    running: next.deadline !== undefined,
    remainingMs:
      next.deadline === undefined ? (next.remainingMs ?? 0) : next.deadline - request.now,
    wakeAt: next.deadline ?? null,
    memory: next,
  };
}
