import { createContext, use } from 'react';
import type { PickerState } from './types';

export interface PickerSource {
  readonly state: PickerState;
  readonly read: () => PickerState;
}

export const PickerSourceContext = createContext<PickerSource | null>(null);

export function usePickerSource(): PickerSource {
  const source = use(PickerSourceContext);
  if (source === null) throw new Error('A widget board needs a picker source provider');
  return source;
}
