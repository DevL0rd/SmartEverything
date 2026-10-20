import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { Checked, Outputs } from '../../interpret/frames';

export interface LocalTime {
  readonly msOfDay: number;
  readonly localAsUtc: Date;
}

export interface StateClock {
  readonly localTime: (at: number) => LocalTime;
}

export interface Kept {
  readonly memory: JsonValue;
  readonly wakeAt?: number | null;
}

export type StateStep =
  | {
      readonly kind: 'done';
      readonly exit: string;
      readonly outputs: Outputs;
      readonly keep?: Kept;
    }
  | {
      readonly kind: 'hold';
      readonly dueAt: number;
      readonly data: JsonValue;
      readonly keep?: Kept;
    };

export interface StateCall {
  readonly now: number;
  readonly inputs: Outputs;
  readonly memory: JsonValue | undefined;
  readonly clock: StateClock;
}

export interface SettleCall {
  readonly now: number;
  readonly memory: JsonValue | undefined;
}

export interface StateAdapter {
  readonly slot?: (inputs: Outputs, nodeId: string) => Checked<string>;
  readonly begin: (call: StateCall) => Checked<StateStep>;
  readonly settle?: (call: SettleCall, data: JsonValue) => Checked<StateStep>;
}

export class StateInputError extends Error {
  override readonly name = 'StateInputError';
}

export function ok<T>(value: T): Checked<T> {
  return { ok: true, value };
}

export function invalid(message: string): Checked<never> {
  return { ok: false, class: 'Invalid', message };
}

export function parsing<T>(schema: z.ZodType<T>, value: unknown, label: string): Checked<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return ok(parsed.data);
  return invalid(`${label}: ${z.prettifyError(parsed.error)}`);
}

export function remembered<T>(
  schema: z.ZodType<T>,
  memory: JsonValue | undefined,
  label: string,
): Checked<T | undefined> {
  if (memory === undefined) return ok(undefined);
  const parsed = schema.safeParse(memory);
  return parsed.success
    ? ok(parsed.data)
    : invalid(`what ${label} remembers cannot be read: ${z.prettifyError(parsed.error)}`);
}

export function kept(memory: unknown, wakeAt?: number | null): Kept {
  const stored = z.json().parse(memory);
  return wakeAt === undefined ? { memory: stored } : { memory: stored, wakeAt };
}

export function attempt<T>(label: string, run: () => T): Checked<T> {
  try {
    return ok(run());
  } catch (cause) {
    if (cause instanceof z.ZodError) return invalid(`${label}: ${z.prettifyError(cause)}`);
    if (cause instanceof StateInputError) return invalid(`${label}: ${cause.message}`);
    throw cause;
  }
}
