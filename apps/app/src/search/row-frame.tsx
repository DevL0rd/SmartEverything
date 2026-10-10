import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import type { RowEdge } from './result-rows';

export type ResultsLook = 'page' | 'popover';

const TOUCH_INDENT = ['', 'pl-14', 'pl-24', 'pl-32'] as const;

const POINTER_INDENT = ['', 'pl-12', 'pl-20', 'pl-28'] as const;

const EDGES: Readonly<Record<RowEdge, string>> = {
  only: 'rounded-lg',
  first: 'rounded-t-lg',
  middle: '',
  last: 'rounded-b-lg',
};

interface RowFrameProps {
  readonly look: ResultsLook;
  readonly edge: RowEdge;
  readonly depth: number;
  readonly selected: boolean;
  readonly children: ReactNode;
}

function frameOf(look: ResultsLook, edge: RowEdge, selected: boolean): string {
  return cn(
    'overflow-hidden',
    look === 'page' ? `bg-surface-1 ${EDGES[edge]}` : 'mx-2 rounded-sm',
    selected && 'bg-primary-container',
  );
}

export function RowFrame({ look, edge, depth, selected, children }: RowFrameProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const indents = pointer ? POINTER_INDENT : TOUCH_INDENT;
  const divided = depth === 0 && (edge === 'middle' || edge === 'last');
  return (
    <View className={frameOf(look, edge, selected)}>
      {divided ? (
        <View className={cn('h-hairline bg-outline-variant', pointer ? 'ml-16' : 'ml-18')} />
      ) : null}
      <View className={indents[Math.min(depth, indents.length - 1)] ?? ''}>{children}</View>
    </View>
  );
}
