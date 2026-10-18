import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import type { Mark } from './listening-model';

const FILL: Readonly<Record<Exclude<Mark, 'hollow'>, string>> = {
  positive: 'bg-positive',
  info: 'bg-info',
  warning: 'bg-warning',
  faint: 'bg-on-surface-faint',
};

export function StateMark({ mark }: { readonly mark: Mark }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        mark === 'hollow' ? 'border-2 border-on-surface-variant' : FILL[mark],
      )}
    />
  );
}
