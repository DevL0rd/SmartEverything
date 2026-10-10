import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useSizeClass } from '../design/size-class';

export interface MasterDetailProps {
  readonly master: ReactNode;
  readonly detail: ReactNode;
  readonly masterWidth?: 'master' | 'popover';
}

export function MasterDetail({
  master,
  detail,
  masterWidth = 'master',
}: MasterDetailProps): ReactNode {
  const { split } = useSizeClass();
  if (!split) {
    return <View className="flex-1">{detail}</View>;
  }
  return (
    <View className="flex-1 flex-row">
      <View
        className={cn(
          'border-r border-outline-variant',
          masterWidth === 'master' ? 'w-master' : 'w-popover',
        )}
      >
        {master}
      </View>
      <View className="min-w-0 flex-1">{detail}</View>
    </View>
  );
}
