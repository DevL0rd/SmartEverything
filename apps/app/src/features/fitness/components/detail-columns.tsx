import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';

export function DetailColumns({
  main,
  side,
}: {
  readonly main: ReactNode;
  readonly side: ReactNode;
}): ReactNode {
  const { split } = useSizeClass();
  return (
    <View className={cn(split ? 'flex-row gap-6' : 'gap-4')}>
      <View className={cn(split ? 'min-w-0 flex-2' : 'gap-4')}>{main}</View>
      <View className={cn(split ? 'min-w-0 flex-1 gap-3' : 'gap-4')}>{side}</View>
    </View>
  );
}
