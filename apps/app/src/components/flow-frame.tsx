import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Head from 'expo-router/head';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { useThemeSetting } from '../design/theme';
import { CONTAINER_WIDTH, gutterOf } from '../design/tokens';
import { IconButton } from './icon-button';
import { KeyboardViewport } from './keyboard-viewport';
import { ShellSearch, type ShellSearchConfig } from './page-shell/search-slot';
import { ShellTitle } from './page-shell/shell-parts';
import { COLLAPSE_AT, SURFACE_AT, TopSurface } from './page-shell/top-shell';
import { ProgressSteps, type ProgressStep } from './progress-steps';
import { useEscape } from './use-escape';

export interface FlowFrameProps {
  readonly title: string;
  readonly steps?: readonly ProgressStep[];
  readonly search?: ShellSearchConfig;
  readonly footer?: ReactNode;
  readonly onCancel: () => void;
  readonly wide?: boolean;
  readonly children: ReactNode;
}

const COLUMN: ViewStyle = { width: '100%', maxWidth: CONTAINER_WIDTH.reading };

function FlowBody({
  steps,
  children,
}: {
  readonly steps: readonly ProgressStep[] | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View testID="shell-body" className="gap-6">
      {steps === undefined ? null : <ProgressSteps steps={steps} />}
      {children}
    </View>
  );
}

function useFlowGutter(): ViewStyle {
  const size = useSizeClass();
  return { paddingHorizontal: gutterOf(size.width, size.idiom, useThemeSetting('density')) };
}

function BarTitle({
  title,
  scrollY,
}: {
  readonly title: string;
  readonly scrollY: SharedValue<number>;
}): ReactNode {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [COLLAPSE_AT - 16, COLLAPSE_AT], [0, 1], 'clamp'),
  }));
  return (
    <Animated.View style={style} aria-hidden pointerEvents="none" className="min-w-0 flex-1 px-1">
      <ShellTitle title={title} size="bar" />
    </Animated.View>
  );
}

function StickySearch({
  search,
  scrollY,
  stuckAt,
  gutter,
}: {
  readonly search: ShellSearchConfig;
  readonly scrollY: SharedValue<number>;
  readonly stuckAt: number;
  readonly gutter: ViewStyle;
}): ReactNode {
  return (
    <View style={gutter} className="pb-2 pt-2">
      <TopSurface scrollY={scrollY} from={stuckAt - SURFACE_AT} to={stuckAt} />
      <View testID="shell-search" style={COLUMN}>
        <ShellSearch search={search} />
      </View>
    </View>
  );
}

function TouchTop({
  title,
  scrollY,
  onCancel,
}: {
  readonly title: string;
  readonly scrollY: SharedValue<number>;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <View testID="shell-top" className="z-10 pt-safe">
      <TopSurface scrollY={scrollY} from={0} to={COLLAPSE_AT} />
      <View className="h-14 flex-row items-center gap-1 px-1">
        <IconButton icon="close" label="Cancel" onPress={onCancel} />
        <BarTitle title={title} scrollY={scrollY} />
      </View>
    </View>
  );
}

function TouchFooter({
  gutter,
  children,
}: {
  readonly gutter: ViewStyle;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View style={gutter} className="border-t border-outline-variant pt-3 pb-safe-offset-3">
      <View style={COLUMN} className="flex-row gap-3">
        {children}
      </View>
    </View>
  );
}

function TouchFlow({
  title,
  steps,
  search,
  footer,
  onCancel,
  children,
}: FlowFrameProps): ReactNode {
  const scrollY = useSharedValue(0);
  const [titleHeight, setTitleHeight] = useState(COLLAPSE_AT);
  const gutter = useFlowGutter();
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  return (
    <KeyboardViewport className="flex-1 bg-bg">
      <TouchTop title={title} scrollY={scrollY} onCancel={onCancel} />
      <Animated.ScrollView
        className="flex-1"
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-6"
        {...(search === undefined ? {} : { stickyHeaderIndices: [1] })}
      >
        <View
          style={gutter}
          className="pb-2 pt-1"
          onLayout={(event) => {
            setTitleHeight(event.nativeEvent.layout.height);
          }}
        >
          <View style={COLUMN}>
            <ShellTitle title={title} size="large" testID="shell-title" />
          </View>
        </View>
        {search === undefined ? null : (
          <StickySearch search={search} scrollY={scrollY} stuckAt={titleHeight} gutter={gutter} />
        )}
        <View style={gutter} className="pt-2">
          <View style={COLUMN}>
            <FlowBody steps={steps}>{children}</FlowBody>
          </View>
        </View>
      </Animated.ScrollView>
      {footer === undefined ? null : <TouchFooter gutter={gutter}>{footer}</TouchFooter>}
    </KeyboardViewport>
  );
}

function DialogTop({
  title,
  search,
  onCancel,
}: {
  readonly title: string;
  readonly search: ShellSearchConfig | undefined;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <View testID="shell-top" className="gap-2 pb-2 pl-6 pr-2 pt-4">
      <View className="min-h-12 flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <ShellTitle title={title} size="desktop" testID="shell-title" />
        </View>
        <IconButton icon="close" label="Cancel" onPress={onCancel} shortcut="Esc" />
      </View>
      {search === undefined ? null : (
        <View className="pr-4">
          <View testID="shell-search">
            <ShellSearch search={search} />
          </View>
        </View>
      )}
    </View>
  );
}

function DialogFlow({
  title,
  steps,
  search,
  footer,
  onCancel,
  wide = false,
  children,
}: FlowFrameProps): ReactNode {
  useEscape(true, onCancel);
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        onPress={onCancel}
        className="absolute inset-0 bg-scrim"
      />
      <View
        accessibilityViewIsModal
        aria-modal
        className={cn(
          'max-h-full w-full overflow-hidden rounded-xl bg-surface-raised elevation-3',
          wide ? 'max-w-dialog-wide' : 'max-w-dialog',
        )}
      >
        <DialogTop title={title} search={search} onCancel={onCancel} />
        <ScrollView
          className="shrink"
          contentContainerClassName="px-6 pb-6 pt-2"
          keyboardShouldPersistTaps="handled"
        >
          <FlowBody steps={steps}>{children}</FlowBody>
        </ScrollView>
        {footer === undefined ? null : (
          <View className="flex-row justify-end gap-2 border-t border-outline-variant px-6 py-4">
            {footer}
          </View>
        )}
      </View>
    </View>
  );
}

export function FlowFrame(props: FlowFrameProps): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <>
      <Head>
        <title>{`${props.title} · SmartEverything`}</title>
      </Head>
      {touch ? <TouchFlow {...props} /> : <DialogFlow {...props} />}
    </>
  );
}
