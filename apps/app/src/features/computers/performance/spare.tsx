import type { ReactNode } from 'react';
import { View } from 'react-native';

const SPARE = { 1: 'min-w-0 flex-1', 2: 'min-w-0 flex-2' } as const;

export function Spare({ spare }: { readonly spare: 0 | 1 | 2 }): ReactNode {
  return spare === 0 ? null : <View aria-hidden className={SPARE[spare]} />;
}
