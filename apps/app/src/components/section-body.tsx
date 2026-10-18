import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '../design/cn';

export type FrameWidth = 'reading' | 'detail' | 'dashboard';

const BODY_WIDTH: Readonly<Record<FrameWidth, string>> = {
  reading: 'max-w-reading',
  detail: 'max-w-detail',
  dashboard: 'max-w-dashboard',
};

interface BodyProps {
  readonly scroll: boolean;
  readonly width: FrameWidth;
  readonly children: ReactNode;
}

export function CompactBody({ scroll, width, children }: BodyProps): ReactNode {
  return (
    <View
      className={cn(
        'gap-section-gap',
        !scroll && 'w-full flex-1 self-center px-gutter pb-section-gap',
        !scroll && BODY_WIDTH[width],
      )}
    >
      {children}
    </View>
  );
}

export function WideBody({
  scroll,
  width,
  rail,
  children,
}: BodyProps & { readonly rail: ReactNode }): ReactNode {
  const inner = cn('w-full gap-section-gap self-center', BODY_WIDTH[width]);
  return (
    <View className="w-full max-w-dashboard flex-1 flex-row self-center pl-gutter">
      {rail}
      <View className="min-w-0 flex-1">
        {!scroll ? (
          <View className={cn(inner, 'flex-1 px-gutter pb-section-gap pt-2')}>{children}</View>
        ) : (
          <ScrollView contentContainerClassName="px-gutter pb-section-gap pt-2">
            <View className={inner}>{children}</View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
