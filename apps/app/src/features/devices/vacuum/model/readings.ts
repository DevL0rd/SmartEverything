import { VacuumValueError } from '@smarteverything/domain';

export type Reading<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string };

export function readingOf<T>(read: () => T): Reading<T> {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof VacuumValueError) {
      return { ok: false, problem: error.message };
    }
    throw error;
  }
}

export function valueOrNull<T>(reading: Reading<T>): T | null {
  return reading.ok ? reading.value : null;
}
