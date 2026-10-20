import { z } from 'zod';
import type { Checked } from '../../interpret/frames';
import { attempt, invalid, kept, ok, parsing, remembered } from './adapter';
import type { StateAdapter, StateCall, StateStep } from './adapter';
import { COUNTER_MEMORY, counter, periodKey } from './counter';
import { HYSTERESIS_MEMORY, hysteresis } from './hysteresis';
import { MACHINE_MEMORY, machine } from './machine';
import { TIMER_MEMORY, timer } from './timer';

const KEY = z.string().default('');

const COUNTER_INPUTS = z.object({
  op: z.enum(['increment', 'decrement', 'reset', 'set']).default('increment'),
  step: z.number().positive().default(1),
  to: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  wrap: z.boolean().default(false),
  resetEvery: z.enum(['never', 'day', 'week', 'month']).default('never'),
  window: z.number().positive().optional(),
  key: KEY,
});

const HYSTERESIS_INPUTS = z.object({
  value: z.number(),
  high: z.number(),
  low: z.number(),
  initial: z.boolean().default(false),
});

const TIMER_INPUTS = z.object({
  op: z.enum(['start', 'restart', 'extend', 'pause', 'resume', 'cancel']).default('start'),
  name: z.string().min(1),
  duration: z.number().positive().optional(),
});

const MACHINE_INPUTS = z.object({
  event: z.string(),
  states: z.array(z.string()),
  initial: z.string(),
  transitions: z.array(
    z.object({
      from: z.string(),
      event: z.string(),
      to: z.string(),
      guard: z.boolean().nullish(),
    }),
  ),
});

const TIMER_SLOT = 'timer:';

function counterBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(COUNTER_INPUTS, call.inputs, 'Counter');
  if (!inputs.ok) return inputs;
  const memory = remembered(COUNTER_MEMORY, call.memory, 'Counter');
  if (!memory.ok) return memory;
  const { resetEvery, window, to, min, max, ...rest } = inputs.value;
  const period =
    resetEvery === 'never'
      ? {}
      : { periodKey: periodKey(resetEvery, call.clock.localTime(call.now).localAsUtc) };
  const outcome = attempt('Counter', () =>
    counter(memory.value, {
      now: call.now,
      ...rest,
      ...period,
      ...(to === undefined ? {} : { to }),
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(window === undefined ? {} : { windowMs: window }),
    }),
  );
  if (!outcome.ok) return outcome;
  return ok({
    kind: 'done',
    exit: 'next',
    outputs: { value: outcome.value.value, reachedMax: outcome.value.reachedMax },
    keep: kept(outcome.value.memory),
  });
}

function hysteresisBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(HYSTERESIS_INPUTS, call.inputs, 'Two thresholds');
  if (!inputs.ok) return inputs;
  const memory = remembered(HYSTERESIS_MEMORY, call.memory, 'Two thresholds');
  if (!memory.ok) return memory;
  const outcome = attempt('Two thresholds', () => hysteresis(memory.value, inputs.value));
  if (!outcome.ok) return outcome;
  const { state, rose, fell } = outcome.value;
  return ok({
    kind: 'done',
    exit: 'next',
    outputs: { state, rose, fell },
    keep: kept(outcome.value.memory),
  });
}

function timerSlot(inputs: Readonly<Record<string, unknown>>): Checked<string> {
  const name = z.string().min(1).safeParse(inputs['name']);
  return name.success ? ok(`${TIMER_SLOT}${name.data}`) : invalid('Timer: the timer needs a name');
}

function timerBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(TIMER_INPUTS, call.inputs, 'Timer');
  if (!inputs.ok) return inputs;
  const memory = remembered(TIMER_MEMORY, call.memory, 'Timer');
  if (!memory.ok) return memory;
  const outcome = attempt('Timer', () =>
    timer(memory.value, {
      now: call.now,
      op: inputs.value.op,
      ...(inputs.value.duration === undefined ? {} : { durationMs: inputs.value.duration }),
    }),
  );
  if (!outcome.ok) return outcome;
  return ok({
    kind: 'done',
    exit: 'next',
    outputs: { remaining: outcome.value.remainingMs, running: outcome.value.running },
    keep: kept(outcome.value.memory, outcome.value.wakeAt),
  });
}

function machineBegin(call: StateCall): Checked<StateStep> {
  const inputs = parsing(MACHINE_INPUTS, call.inputs, 'Modes');
  if (!inputs.ok) return inputs;
  const memory = remembered(MACHINE_MEMORY, call.memory, 'Modes');
  if (!memory.ok) return memory;
  const transitions = inputs.value.transitions.map(({ guard, ...rest }) => ({
    ...rest,
    ...(guard === null || guard === undefined ? {} : { guard }),
  }));
  const outcome = attempt('Modes', () => machine(memory.value, { ...inputs.value, transitions }));
  if (!outcome.ok) return outcome;
  const { state, previous, changed } = outcome.value;
  return ok({
    kind: 'done',
    exit: 'next',
    outputs: { state, previous, changed },
    keep: kept(outcome.value.memory),
  });
}

export const MEMORY_ADAPTERS: Readonly<Record<string, StateAdapter>> = {
  'state.counter': { begin: counterBegin },
  'timing.hysteresis': { begin: hysteresisBegin },
  'state.timer': { slot: timerSlot, begin: timerBegin },
  'state.machine': { begin: machineBegin },
};
