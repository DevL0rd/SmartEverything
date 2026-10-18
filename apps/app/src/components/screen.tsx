import { useMemo, type ReactElement, type ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedRef,
} from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useIsFocused, useScrollToTop } from 'expo-router';
import { withUniwind } from 'uniwind';
import { cn } from '../design/cn';
import { useScreenViewport } from '../design/viewport';
import { Ambient } from './ambient';
import { useToastObstacle } from './toast-obstacles';
import {
  PrimaryAction,
  usePrimaryActionPlacement,
  type PrimaryActionProps,
} from './primary-action';
import { HeaderSlotContext, ScreenContext, useScreen, type ScreenValue } from './screen-context';

const KeyboardViewport = withUniwind(KeyboardAvoidingView);

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
  readonly externalScroll?: boolean;
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
  scrollable: boolean,
): ScreenValue {
  const viewport = useScreenViewport(scrollY);
  return useMemo(
    () => ({ scrollY, scrollRef, scrollable, primaryAction: primaryAction ?? null, viewport }),
    [scrollY, scrollRef, scrollable, primaryAction, viewport],
  );
}

function StaticBody({
  header,
  banner,
  externalScroll,
  maxWidth,
  children,
}: {
  readonly header: ReactElement | undefined;
  readonly banner: ReactNode;
  readonly externalScroll: boolean;
  readonly maxWidth: ScreenWidth;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="flex-1">
      {externalScroll ? null : (
        <View className={cn('w-full self-center px-gutter', WIDTH[maxWidth])}>
          <HeaderSlotContext.Provider value="large">{header}</HeaderSlotContext.Provider>
          {banner}
        </View>
      )}
      {children}
    </View>
  );
}

type ContentBodyProps = Parameters<typeof ScrollBody>[0] & {
  readonly scroll: boolean;
  readonly externalScroll: boolean;
};

function ContentBody({ scroll, externalScroll, ...content }: ContentBodyProps): ReactNode {
  return scroll ? (
    <ScrollBody {...content} />
  ) : (
    <StaticBody
      header={content.header}
      banner={content.banner}
      externalScroll={externalScroll}
      maxWidth={content.maxWidth}
    >
      {content.children}
    </StaticBody>
  );
}

export function Screen({
  header,
  maxWidth = 'dashboard',
  scroll = true,
  externalScroll = false,
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
  const value = useScreenValue(
    scrollY,
    scroll ? scrollRef : null,
    primaryAction,
    scroll || externalScroll,
  );
  return (
    <ScreenContext.Provider value={value}>
      <KeyboardViewport behavior="padding" automaticOffset className="flex-1">
        <Ambient />
        {header}
        <ContentBody
          scroll={scroll}
          externalScroll={externalScroll}
          scrollRef={scrollRef}
          header={header}
          banner={banner}
          maxWidth={maxWidth}
          onRefresh={onRefresh}
          refreshing={refreshing}
          fab={fab}
        >
          {children}
        </ContentBody>
        <Footer>{footer}</Footer>
        {primaryAction !== undefined && fab ? <PrimaryAction {...primaryAction} /> : null}
      </KeyboardViewport>
    </ScreenContext.Provider>
  );
}
