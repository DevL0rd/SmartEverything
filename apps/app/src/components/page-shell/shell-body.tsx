import { useContext, type ReactNode } from 'react';
import { RefreshControl, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedRef,
} from 'react-native-reanimated';
import { useIsFocused, useScrollToTop } from 'expo-router';
import { cn } from '../../design/cn';
import { DURATION, EASING, useMotion } from '../../design/motion';
import { useBottomChrome } from '../bottom-chrome';
import { ScreenScrollContext, useScreen } from '../screen-context';
import { useToastObstacle } from '../toast-obstacles';
import type { ShellColumn } from './layout';
import type { ShellFooterHides } from './shell-types';
import { columnStyle, widthStyle } from './top-shell';

export interface ShellRefresh {
  readonly onRefresh: (() => void) | undefined;
  readonly refreshing: boolean;
}

function useScrollLayoutEvent(): () => void {
  const scroll = useContext(ScreenScrollContext);
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

function directionOf(now: number, before: number, current: number): number {
  'worklet';
  if (now <= 0 || now < before) return 0;
  return now > before ? 1 : current;
}

function useScrollAway(): {
  readonly style: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  readonly measure: (event: LayoutChangeEvent) => void;
} {
  const { scrollY } = useScreen();
  const { reduced } = useMotion();
  const away = useSharedValue(0);
  const shown = useSharedValue(1);
  const height = useSharedValue(0);
  useAnimatedReaction(
    () => scrollY.get(),
    (now, before) => {
      if (before === null) return;
      const next = directionOf(now, before, away.get());
      if (next === away.get()) return;
      away.set(next);
      const target = 1 - next;
      shown.set(
        reduced
          ? target
          : withTiming(target, { duration: DURATION.short, easing: EASING.standard }),
      );
    },
    [reduced],
  );
  const style = useAnimatedStyle((): ViewStyle =>
    height.get() === 0
      ? { opacity: shown.get() }
      : { opacity: shown.get(), height: height.get() * shown.get() },
  );
  return {
    style,
    measure: (event): void => {
      height.set(event.nativeEvent.layout.height);
    },
  };
}

function FooterFrame({
  children,
  onMeasured,
}: {
  readonly children: ReactNode;
  readonly onMeasured?: (event: LayoutChangeEvent) => void;
}): ReactNode {
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  const aboveChrome = useBottomChrome();
  return (
    <View
      ref={attach}
      onLayout={(event) => {
        onLayout();
        onMeasured?.(event);
      }}
      className={cn(
        'border-t border-outline-variant bg-chrome px-gutter pt-3',
        aboveChrome ? 'pb-3' : 'pb-safe-offset-3',
      )}
    >
      {children}
    </View>
  );
}

function ScrollAwayFooter({ children }: { readonly children: ReactNode }): ReactNode {
  const { style, measure } = useScrollAway();
  return (
    <Animated.View style={style} className="overflow-hidden">
      <FooterFrame onMeasured={measure}>{children}</FooterFrame>
    </Animated.View>
  );
}

export function ShellFooter({
  hides,
  children,
}: {
  readonly hides?: ShellFooterHides | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return hides === 'scroll' ? (
    <ScrollAwayFooter>{children}</ScrollAwayFooter>
  ) : (
    <FooterFrame>{children}</FooterFrame>
  );
}
