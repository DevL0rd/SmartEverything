import { use, type ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, type AnimatedRef } from 'react-native-reanimated';
import { useIsFocused, useScrollToTop } from 'expo-router';
import { cn } from '../../design/cn';
import { useBottomChrome } from '../bottom-chrome';
import { ScreenScrollContext, useScreen } from '../screen-context';
import { useToastObstacle } from '../toast-obstacles';
import type { ShellColumn } from './layout';
import { columnStyle, widthStyle } from './top-shell';

export interface ShellRefresh {
  readonly onRefresh: (() => void) | undefined;
  readonly refreshing: boolean;
}

function useScrollLayoutEvent(): () => void {
  const scroll = use(ScreenScrollContext);
  return (): void => {
    scroll?.layout.set((current) => current + 1);
  };
}

export function BodyColumn({
  column,
  banner,
  fill,
  children,
}: {
  readonly column: ShellColumn;
  readonly banner: ReactNode;
  readonly fill: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      testID="shell-body"
      style={widthStyle(column.width)}
      className={cn('gap-section-gap', fill && 'flex-1')}
    >
      {banner === undefined ? null : <View>{banner}</View>}
      {children}
    </View>
  );
}

export function ShellScroll({
  scrollRef,
  refresh,
  left,
  fab,
  children,
}: {
  readonly scrollRef: AnimatedRef<Animated.ScrollView>;
  readonly refresh: ShellRefresh;
  readonly left: number;
  readonly fab: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const { scrollY } = useScreen();
  useScrollToTop(scrollRef);
  const onLayout = useScrollLayoutEvent();
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  return (
    <Animated.ScrollView
      ref={scrollRef}
      className="flex-1"
      onLayout={onLayout}
      onContentSizeChange={onLayout}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        refresh.onRefresh === undefined ? undefined : (
          <RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} />
        )
      }
      contentContainerStyle={{ paddingLeft: left }}
      contentContainerClassName={cn('pb-section-gap', fab && 'pb-28')}
    >
      {children}
    </Animated.ScrollView>
  );
}

export function StaticBody({
  column,
  banner,
  fab,
  children,
}: {
  readonly column: ShellColumn;
  readonly banner: ReactNode;
  readonly fab: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View style={columnStyle(column)} className={cn('flex-1 pt-4', fab && 'pb-24')}>
      <BodyColumn column={column} banner={banner} fill>
        {children}
      </BodyColumn>
    </View>
  );
}

export function ShellFooter({ children }: { readonly children: ReactNode }): ReactNode {
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  const aboveChrome = useBottomChrome();
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      className={cn(
        'border-t border-outline-variant bg-chrome px-gutter pt-3',
        aboveChrome ? 'pb-3' : 'pb-safe-offset-3',
      )}
    >
      {children}
    </View>
  );
}
