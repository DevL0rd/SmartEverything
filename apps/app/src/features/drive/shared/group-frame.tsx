import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import type { GroupEdge } from './shared-model';

const EDGE: Readonly<Record<GroupEdge, string>> = {
  only: 'rounded-lg border-y',
  first: 'rounded-t-lg border-t',
  middle: 'border-t',
  last: 'rounded-b-lg border-y',
};

export function GroupFrame({
  edge,
  children,
}: {
  readonly edge: GroupEdge;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn('overflow-hidden border-x border-outline-variant bg-surface-1', EDGE[edge])}
    >
      {children}
    </View>
  );
}
