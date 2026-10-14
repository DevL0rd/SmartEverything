import { useMemo, type ReactElement, type ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedRef,
} from 'react-native-reanimated';
import { useIsFocused, useScrollToTop } from 'expo-router';
import { cn } from '../design/cn';
import { Ambient } from './ambient';
import { KeyboardViewport } from './keyboard-viewport';
import { useToastObstacle } from './toast-obstacles';
import {
  PrimaryAction,
  usePrimaryActionPlacement,
  type PrimaryActionProps,
} from './primary-action';
import { HeaderSlotContext, ScreenContext, useScreen, type ScreenValue } from './screen-context';

type ScreenWidth = 'dashboard' | 'detail' | 'reading' | 'full';

const WIDTH: Readonly<Record<ScreenWidth, string>> = {
  dashboard: 'max-w-dashboard',
  detail: 'max-w-detail',
  reading: 'max-w-reading',
  full: '',
};

export interface ScreenProps {
  readonly header?: ReactElement;
  readonly maxWidth?: ScreenWidth;
  readonly scroll?: boolean;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  readonly primaryAction?: PrimaryActionProps;
  readonly banner?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

function FooterBar({ children }: { readonly children: ReactNode }): ReactNode {
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      className="border-t border-outline-variant bg-chrome px-gutter pt-3 pb-safe-offset-3"
    >
      {children}
    </View>
  );
}

function Footer({ children }: { readonly children: ReactNode }): ReactNode {
  if (children === undefined) {
    return null;
  }
  return <FooterBar>{children}</FooterBar>;
}

function Body({
  maxWidth,
  children,
}: {
  readonly maxWidth: ScreenWidth;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className={cn('w-full gap-section-gap self-center', WIDTH[maxWidth])}>{children}</View>
  );
}

function ScrollBody({
  scrollRef,
  header,
  banner,
  maxWidth,
  onRefresh,
  refreshing,
  fab,
  children,
}: {
  readonly scrollRef: AnimatedRef<Animated.ScrollView>;
  readonly header: ReactElement | undefined;
  readonly banner: ReactNode;
  readonly maxWidth: ScreenWidth;
  readonly onRefresh: (() => void) | undefined;
  readonly refreshing: boolean;
  readonly fab: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const { scrollY } = useScreen();
  useScrollToTop(scrollRef);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  return (
    <Animated.ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh === undefined ? undefined : (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        )
      }
      contentContainerClassName={cn('px-gutter pb-section-gap', fab && 'pb-28')}
    >
      <View className={cn('w-full self-center', WIDTH[maxWidth])}>
        <HeaderSlotContext.Provider value="large">{header}</HeaderSlotContext.Provider>
        {banner === undefined ? null : <View className="pb-4">{banner}</View>}
      </View>
      <Body maxWidth={maxWidth}>{children}</Body>
    </Animated.ScrollView>
  );
}

function useScreenValue(
  scrollY: ScreenValue['scrollY'],
  scrollRef: ScreenValue['scrollRef'],
  primaryAction: PrimaryActionProps | undefined,
): ScreenValue {
  return useMemo(
    () => ({ scrollY, scrollRef, primaryAction: primaryAction ?? null }),
    [scrollY, scrollRef, primaryAction],
  );
}

export function Screen({
  header,
  maxWidth = 'dashboard',
  scroll = true,
  onRefresh,
  refreshing = false,
  primaryAction,
  banner,
  footer,
  children,
}: ScreenProps): ReactNode {
  const scrollY = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const placement = usePrimaryActionPlacement();
  const fab = primaryAction !== undefined && placement === 'fab';
  const value = useScreenValue(scrollY, scroll ? scrollRef : null, primaryAction);
  return (
    <ScreenContext.Provider value={value}>
      <KeyboardViewport>
        <Ambient />
        {header}
        {scroll ? (
          <ScrollBody
            scrollRef={scrollRef}
            header={header}
            banner={banner}
            maxWidth={maxWidth}
            onRefresh={onRefresh}
            refreshing={refreshing}
            fab={fab}
          >
            {children}
          </ScrollBody>
        ) : (
          <View className="flex-1">
            <View className={cn('w-full self-center px-gutter', WIDTH[maxWidth])}>
              <HeaderSlotContext.Provider value="large">{header}</HeaderSlotContext.Provider>
              {banner}
            </View>
            {children}
          </View>
        )}
        <Footer>{footer}</Footer>
        {primaryAction !== undefined && fab ? <PrimaryAction {...primaryAction} /> : null}
      </KeyboardViewport>
    </ScreenContext.Provider>
  );
}
