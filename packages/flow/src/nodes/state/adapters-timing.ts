import { z } from 'zod';
import type { Checked } from '../../interpret/frames';
import { attempt, kept, ok, parsing, remembered } from './adapter';
import type { SettleCall, StateAdapter, StateCall, StateStep } from './adapter';
import { COOLDOWN_MEMORY, EMPTY_COOLDOWN, cooldown } from './cooldown';
import { DEBOUNCE_MEMORY, arrive, settle } from './debounce';
import { quietHours } from './quiet-hours';
import { RATE_LIMIT_MEMORY, rateLimit } from './rate-limit';

const MILLISECONDS = z.number().int().min(0);
const KEY = z.string().default('');

const COOLDOWN_INPUTS = z.object({ period: MILLISECONDS, key: KEY });

const DEBOUNCE_INPUTS = z.object({ quiet: MILLISECONDS, key: KEY });

const DEBOUNCE_HELD = z.strictObject({ ticket: z.int().min(0), key: z.string() });

const RATE_LIMIT_INPUTS = z.object({
  max: z.int().min(1),
  window: z.number().int().min(1),
  key: KEY,
  excess: z.enum(['drop', 'queue']).default('drop'),
});

const QUIET_INPUTS = z.object({
  from: z.string(),
  to: z.string(),
  priority: z.int().default(0),
  bypass: z.int().optional(),
  quiet: z.enum(['wait', 'skip']).default('wait'),
});

const HELD_FOR = z.strictObject({ name: z.enum(['delay', 'heldFor']), ms: z.number() });

function cooldownBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(COOLDOWN_INPUTS, call.inputs, 'At most once per');
  if (!inputs.ok) return inputs;
  const memory = remembered(COOLDOWN_MEMORY, call.memory, 'At most once per');
  if (!memory.ok) return memory;
  const outcome = attempt('At most once per', () =>
    cooldown(memory.value ?? EMPTY_COOLDOWN, {
      now: call.now,
      periodMs: inputs.value.period,
      key: inputs.value.key,
    }),
  );
  if (!outcome.ok) return outcome;
  if (outcome.value.exit === 'blocked') {
    return ok({
      kind: 'done',
      exit: 'blocked',
      outputs: { remaining: outcome.value.remainingMs },
    });
  }
  return ok({
    kind: 'done',
    exit: 'pass',
    outputs: {},
    keep: kept(outcome.value.memory),
  });
}

function debounceBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(DEBOUNCE_INPUTS, call.inputs, 'Settle first');
  if (!inputs.ok) return inputs;
  const memory = remembered(DEBOUNCE_MEMORY, call.memory, 'Settle first');
  if (!memory.ok) return memory;
  const ticket = attempt('Settle first', () =>
    arrive(memory.value, { now: call.now, quietMs: inputs.value.quiet, key: inputs.value.key }),
  );
  if (!ticket.ok) return ticket;
  return ok({
    kind: 'hold',
    dueAt: ticket.value.dueAt,
    data: { ticket: ticket.value.ticket, key: inputs.value.key },
    keep: kept(ticket.value.memory),
  });
}

function debounceSettle(call: SettleCall, data: unknown): Checked<StateStep> {
  const held = parsing(DEBOUNCE_HELD, data, 'Settle first');
  if (!held.ok) return held;
  const memory = remembered(DEBOUNCE_MEMORY, call.memory, 'Settle first');
  if (!memory.ok) return memory;
  if (memory.value === undefined) {
    return ok({ kind: 'done', exit: 'superseded', outputs: {} });
  }
  const settled = settle(memory.value, held.value);
  return ok({
    kind: 'done',
    exit: settled.exit === 'continue' ? 'next' : 'superseded',
    outputs: {},
    keep: kept(settled.memory),
  });
}

function rateLimitBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(RATE_LIMIT_INPUTS, call.inputs, 'Rate limit');
  if (!inputs.ok) return inputs;
  const memory = remembered(RATE_LIMIT_MEMORY, call.memory, 'Rate limit');
  if (!memory.ok) return memory;
  const outcome = attempt('Rate limit', () =>
    rateLimit(memory.value, {
      now: call.now,
      max: inputs.value.max,
      windowMs: inputs.value.window,
      key: inputs.value.key,
      excess: inputs.value.excess,
    }),
  );
  if (!outcome.ok) return outcome;
  const stored = kept(outcome.value.memory);
  if (outcome.value.exit === 'dropped') {
    return ok({ kind: 'done', exit: 'dropped', outputs: {}, keep: stored });
  }
  const { delayMs } = outcome.value;
  if (delayMs === 0) return ok({ kind: 'done', exit: 'pass', outputs: {}, keep: stored });
  return ok({
    kind: 'hold',
    dueAt: call.now + delayMs,
    data: { name: 'delay', ms: delayMs },
    keep: stored,
  });
}

function quietBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(QUIET_INPUTS, call.inputs, 'Quiet hours');
  if (!inputs.ok) return inputs;
  const { msOfDay } = call.clock.localTime(call.now);
  const outcome = attempt('Quiet hours', () =>
    quietHours({
      msOfDay,
      from: inputs.value.from,
      to: inputs.value.to,
      priority: inputs.value.priority,
      ...(inputs.value.bypass === undefined ? {} : { bypass: inputs.value.bypass }),
      quiet: inputs.value.quiet,
    }),
  );
  if (!outcome.ok) return outcome;
  if (outcome.value.exit === 'held') return ok({ kind: 'done', exit: 'held', outputs: {} });
  if (outcome.value.holdMs === 0) return ok({ kind: 'done', exit: 'pass', outputs: {} });
  return ok({
    kind: 'hold',
    dueAt: call.now + outcome.value.holdMs,
    data: { name: 'heldFor', ms: outcome.value.holdMs },
  });
}

function heldSettle(_call: SettleCall, data: unknown): Checked<StateStep> {
  const held = parsing(HELD_FOR, data, 'The held run');
  if (!held.ok) return held;
  return ok({ kind: 'done', exit: 'pass', outputs: { [held.value.name]: held.value.ms } });
}

export const TIMING_ADAPTERS: Readonly<Record<string, StateAdapter>> = {
  'timing.cooldown': { begin: cooldownBegin },
  'timing.debounce': { begin: debounceBegin, settle: debounceSettle },
  'timing.rate_limit': { begin: rateLimitBegin, settle: heldSettle },
  'timing.quiet_hours': { begin: quietBegin, settle: heldSettle },
};
