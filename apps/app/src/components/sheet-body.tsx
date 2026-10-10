import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '../design/cn';

export function SheetBody({
  scroll,
  padding,
  children,
}: {
  readonly scroll: boolean;
  readonly padding: string;
  readonly children: ReactNode;
}): ReactNode {
  if (scroll) {
    return (
      <ScrollView className="shrink" contentContainerClassName={padding}>
        {children}
      </ScrollView>
    );
  }
  return <View className={cn('min-h-0 flex-1', padding)}>{children}</View>;
}
