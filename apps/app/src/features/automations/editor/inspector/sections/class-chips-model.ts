import type { CATCHABLE_ERROR_CLASS } from '@smarteverything/domain';
import type { z } from 'zod';

export type CatchableClass = z.infer<typeof CATCHABLE_ERROR_CLASS>;

export const CATCH_CLASSES: readonly { readonly value: CatchableClass; readonly label: string }[] =
  [
    { value: 'Refused', label: 'Refused' },
    { value: 'Unreachable', label: 'Unreachable' },
    { value: 'Timeout', label: 'Timed out' },
    { value: 'Unknown', label: 'Unknown outcome' },
    { value: 'TypeError', label: 'Wrong type' },
    { value: 'MathError', label: 'Math error' },
    { value: 'Invalid', label: 'Invalid' },
    { value: 'NotFound', label: 'Not found' },
    { value: 'Forbidden', label: 'Not allowed' },
    { value: 'LimitExceeded', label: 'Limit reached' },
    { value: 'Failed', label: 'Failed' },
  ];

export function toggledClass(
  current: readonly CatchableClass[],
  name: CatchableClass,
): readonly CatchableClass[] {
  return current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name];
}
