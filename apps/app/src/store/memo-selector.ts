import { shallowEqual } from './store-context';
import type { StoreState } from './state';

export function memoOnInputs<T>(
  inputs: (state: StoreState) => readonly unknown[],
  compute: (state: StoreState) => T,
): (state: StoreState) => T {
  let last: { readonly inputs: readonly unknown[]; readonly value: T } | null = null;
  return (state) => {
    const now = inputs(state);
    if (last !== null && shallowEqual(last.inputs, now)) {
      return last.value;
    }
    const value = compute(state);
    last = { inputs: now, value };
    return value;
  };
}
