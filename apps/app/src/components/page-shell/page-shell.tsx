import { use, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type Animated from 'react-native-reanimated';
import {
  useAnimatedRef,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import Head from 'expo-router/head';
import { useSizeClass } from '../../design/size-class';
import { useThemeSetting } from '../../design/theme';
import { gutterOf } from '../../design/tokens';
import { useScreenViewport } from '../../design/viewport';
import { Ambient } from '../ambient';
import { BottomSheet } from '../bottom-sheet';
import { KeyboardViewport } from '../keyboard-viewport';
import {
  PrimaryAction,
  usePrimaryActionPlacement,
  type PrimaryActionProps,
} from '../primary-action';
import {
  ScreenContext,
  ScreenScrollContext,
  type ScreenScroll,
  type ScreenValue,
} from '../screen-context';
import { BodyWidthContext } from './body-width';
import { asideDockedAt, shellColumnOf, shellRailOf } from './layout';
import { PhoneFrame } from './phone-frame';
import { ShellFooter } from './shell-body';
import { compactSections, selecting, type FrameProps, type ShellLayout } from './shell-frame';
import { SectionsPullUp, railFormOf, sectionsPullUp, type ShellSections } from './shell-sections';
import {
  isVariantShell,
  type PageShellProps,
  type ShellAside,
  type StandardShellProps,
} from './shell-types';
import { ShellInsetContext } from './shell-inset';
import { OverlayShell, PaneShell } from './shell-variants';
import { WideFrame } from './wide-frame';

export type {
  PageShellProps,
  ShellAside,
  ShellVariant,
  StandardShellProps,
  VariantShellProps,
} from './shell-types';

function useShellLayout(shell: StandardShellProps): ShellLayout {
  const size = useSizeClass();
  const area = size.area - use(ShellInsetContext);
  const gutter = gutterOf(size.width, size.idiom, useThemeSetting('density'));
  const phone = size.header === 'large';
  const rail = phone ? null : shellRailOf(area, railFormOf(shell.sections));
  const docked = shell.aside?.open === true && !phone && asideDockedAt(area);
  const column = shellColumnOf({
    area,
    gutter,
    rail,
    aside: docked ? shell.aside.width : 0,
  });
  return { header: size.header, gutter, rail, docked, column };
}

function useShellValue(
  scrollY: SharedValue<number>,
  scrollRef: AnimatedRef<Animated.ScrollView> | null,
  primaryAction: PrimaryActionProps | undefined,
  scrollable: boolean,
): ScreenValue {
  const viewport = useScreenViewport(scrollY);
  return useMemo(
    () => ({ scrollY, scrollRef, scrollable, primaryAction: primaryAction ?? null, viewport }),
    [scrollY, scrollRef, scrollable, primaryAction, viewport],
  );
}

function useScrollAnchor(
  scroll: boolean,
  scrollRef: AnimatedRef<Animated.ScrollView>,
  scrollY: SharedValue<number>,
  layout: SharedValue<number>,
): ScreenScroll | null {
  return useMemo(
    () => (scroll ? { scrollRef, scrollY, layout } : null),
    [scroll, scrollRef, scrollY, layout],
  );
}

function AsideSheet({ aside }: { readonly aside: ShellAside }): ReactNode {
  return (
    <BottomSheet
      open={aside.open}
      onClose={aside.onClose}
      label={aside.label}
      title={aside.label}
      detents={['half', 'full']}
    >
      {aside.children}
    </BottomSheet>
  );
}

function PullUp({
  sections,
  title,
  open,
  onClose,
}: {
  readonly sections: ShellSections | undefined;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  if (sections === undefined) return null;
  return <SectionsPullUp open={open} onClose={onClose} title={title} sections={sections} />;
}

function useFabAction(shell: StandardShellProps): PrimaryActionProps | undefined {
  const placement = usePrimaryActionPlacement();
  return placement === 'fab' && !selecting(shell) ? shell.primaryAction : undefined;
}

function pullUpSectionsOf(
  shell: StandardShellProps,
  layout: ShellLayout,
): ShellSections | undefined {
  const sections = compactSections(shell, layout.rail);
  return sections !== undefined && sectionsPullUp(sections) ? sections : undefined;
}

function ShellProviders({
  value,
  anchor,
  width,
  title,
  children,
}: {
  readonly value: ScreenValue;
  readonly anchor: ScreenScroll | null;
  readonly width: number;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ScreenContext value={value}>
      <ScreenScrollContext value={anchor}>
        <BodyWidthContext value={width}>
          <Head>
            <title>{`${title} · SmartEverything`}</title>
          </Head>
          <KeyboardViewport className="flex-1">
            <Ambient />
            {children}
          </KeyboardViewport>
        </BodyWidthContext>
      </ScreenScrollContext>
    </ScreenContext>
  );
}

function StandardShell(shell: StandardShellProps): ReactNode {
  const layout = useShellLayout(shell);
  const scrollY = useSharedValue(0);
  const tick = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [pullUp, setPullUp] = useState(false);
  const scroll = shell.scroll !== false;
  const fabAction = useFabAction(shell);
  const value = useShellValue(scrollY, scroll ? scrollRef : null, shell.primaryAction, scroll);
  const anchor = useScrollAnchor(scroll, scrollRef, scrollY, tick);
  const phone = layout.header === 'large';
  const pullUpSections = pullUpSectionsOf(shell, layout);
  const frame: FrameProps = {
    shell,
    layout,
    scrollY,
    scrollRef,
    fab: fabAction !== undefined,
    openPullUp:
      pullUpSections === undefined
        ? undefined
        : (): void => {
            setPullUp(true);
          },
  };
  return (
    <ShellProviders value={value} anchor={anchor} width={layout.column.width} title={shell.title}>
      <View className="min-h-0 flex-1">
        {phone ? <PhoneFrame {...frame} /> : <WideFrame {...frame} />}
        {fabAction === undefined ? null : <PrimaryAction {...fabAction} />}
      </View>
      {!phone || shell.footer === undefined ? null : <ShellFooter>{shell.footer}</ShellFooter>}
      <PullUp
        sections={pullUpSections}
        title={shell.title}
        open={pullUp}
        onClose={() => {
          setPullUp(false);
        }}
      />
      {shell.aside === undefined || layout.docked ? null : <AsideSheet aside={shell.aside} />}
    </ShellProviders>
  );
}

export function PageShell(shell: PageShellProps): ReactNode {
  if (!isVariantShell(shell)) return <StandardShell {...shell} />;
  return shell.variant === 'overlay' ? <OverlayShell {...shell} /> : <PaneShell {...shell} />;
}
