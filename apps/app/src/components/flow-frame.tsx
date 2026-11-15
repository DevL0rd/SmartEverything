import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Head from 'expo-router/head';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { useSizeClass } from '../design/size-class';
import { useThemeSetting } from '../design/theme';
import { gutterOf } from '../design/tokens';
import { IconButton } from './icon-button';
import { KeyboardViewport } from './keyboard-viewport';
import {
  BarInline,
  BarTrailing,
  OpenSearch,
  barOptionsOf,
  useBarSearch,
  useSearchOptionsPlace,
} from './page-shell/bar-search';
import type { ShellSearchConfig } from './page-shell/search-slot';
import { ShellTitle } from './page-shell/shell-parts';
import { ShellStatus } from './page-shell/shell-status';
import { SURFACE_AT, TopSurface } from './page-shell/top-shell';
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

const DIALOG_GUTTER: ViewStyle = { paddingLeft: 4, paddingRight: 16 };

function useFlowGutter(): ViewStyle {
  const size = useSizeClass();
  return { paddingHorizontal: gutterOf(size.width, size.idiom, useThemeSetting('density')) };
}

function FlowBar({
  title,
  search,
  close,
  className,
}: {
  readonly title: string;
  readonly search: ShellSearchConfig | undefined;
  readonly close: ReactNode;
  readonly className: string;
}): ReactNode {
  const bar = useBarSearch(search);
  if (search !== undefined && bar.mode === 'open') {
    return (
      <View className={className}>
        <OpenSearch search={search} onClose={bar.close} />
        <ShellStatus />
      </View>
    );
  }
  return (
    <View
      className={className}
      onLayout={(event) => {
        bar.onBar(event.nativeEvent.layout.width);
      }}
    >
      <View className="min-w-0 flex-1 px-1">
        <ShellTitle title={title} size="bar" testID="shell-title" />
      </View>
      <BarInline search={search} bar={bar} />
      <BarTrailing search={search} bar={bar}>
        <ShellStatus />
        {close}
      </BarTrailing>
    </View>
  );
}

function FlowOptions({
  search,
  gutter,
}: {
  readonly search: ShellSearchConfig | undefined;
  readonly gutter: ViewStyle;
}): ReactNode {
  const options = barOptionsOf(search, useSearchOptionsPlace());
  if (options === undefined) return null;
  return (
    <View style={gutter} testID="shell-search-options" className="pb-2">
      {options}
    </View>
  );
}

function TouchTop({
  title,
  search,
  scrollY,
  gutter,
  onCancel,
}: {
  readonly title: string;
  readonly search: ShellSearchConfig | undefined;
  readonly scrollY: SharedValue<number>;
  readonly gutter: ViewStyle;
  readonly onCancel: () => void;
}): ReactNode {
  return (
    <View testID="shell-top" className="z-10 pt-safe">
      <TopSurface scrollY={scrollY} from={0} to={SURFACE_AT} />
      <View className="h-14 flex-row items-center gap-1 px-1">
        <IconButton icon="close" label="Cancel" onPress={onCancel} />
        <FlowBar
          title={title}
          search={search}
          close={null}
          className="min-w-0 flex-1 flex-row items-center gap-1"
        />
      </View>
      <FlowOptions search={search} gutter={gutter} />
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
      <View className="flex-row gap-3">{children}</View>
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
  const gutter = useFlowGutter();
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  return (
    <KeyboardViewport className="flex-1 bg-bg">
      <TouchTop
        title={title}
        search={search}
        scrollY={scrollY}
        gutter={gutter}
        onCancel={onCancel}
      />
      <Animated.ScrollView
        className="flex-1"
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-6"
      >
        <View style={gutter} className="pt-2">
          <FlowBody steps={steps}>{children}</FlowBody>
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
    <View testID="shell-top" className="gap-2 pb-2 pl-5 pr-2 pt-4">
      <FlowBar
        title={title}
        search={search}
        close={<IconButton icon="close" label="Cancel" onPress={onCancel} shortcut="Esc" />}
        className="min-h-12 flex-row items-center gap-2"
      />
      <FlowOptions search={search} gutter={DIALOG_GUTTER} />
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
