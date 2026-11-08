import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';

export function SheetBody({
  scroll,
  padding,
  fit = false,
  fill = false,
  reading = false,
  children,
}: {
  readonly scroll: boolean;
  readonly padding: string;
  readonly fit?: boolean;
  readonly fill?: boolean;
  readonly reading?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  if (scroll) {
    const keyboardScroll = reading && !isNative();
    return (
      <ScrollView
        className={cn(
          'min-h-0',
          fill ? 'flex-1' : 'shrink',
          keyboardScroll &&
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
        )}
        tabIndex={keyboardScroll ? 0 : undefined}
        role={keyboardScroll ? 'region' : undefined}
        accessibilityLabel={keyboardScroll ? 'Contents' : undefined}
        contentContainerClassName={padding}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }
  return <View className={cn('min-h-0', fit ? 'shrink' : 'flex-1', padding)}>{children}</View>;
}
