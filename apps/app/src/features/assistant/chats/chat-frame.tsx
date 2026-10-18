import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';

export function ChatFrame({
  list,
  conversation,
  slideOver,
}: {
  readonly list: ReactNode;
  readonly conversation: ReactNode;
  readonly slideOver: ReactNode;
}): ReactNode {
  return (
    <View className="relative flex-1 flex-row">
      {list}
      <View className={cn('min-w-0 flex-1', conversation === null && 'hidden')}>
        {conversation}
      </View>
      {slideOver}
    </View>
  );
}
