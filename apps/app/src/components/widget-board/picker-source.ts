import { createContext, use } from 'react';
import { usePausable } from '../../design/external-store';
import type { PickerState } from './types';

export interface PickerSource {
  readonly read: () => PickerState;
  readonly subscribe: (wake: () => void) => () => void;
}

export interface PickerView {
  readonly state: PickerState;
  readonly read: () => PickerState;
}

export const PickerSourceContext = createContext<PickerSource | null>(null);

function required(source: PickerSource | null): PickerSource {
  if (source === null) throw new Error('A widget board needs a picker source provider');
  return source;
}

export function usePickerSource(): PickerView {
  const source = required(use(PickerSourceContext));
  const state = usePausable(source.subscribe, source.read);
  return { state, read: source.read };
}
