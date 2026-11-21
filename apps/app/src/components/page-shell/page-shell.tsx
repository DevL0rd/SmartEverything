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
import { asideDockedAt, sectionRailOf, shellColumnOf } from './layout';
import { PhoneFrame } from './phone-frame';
import { ShellFooter } from './shell-body';
import { selecting, type FrameProps, type ShellLayout } from './shell-frame';
import { railFormOf } from './shell-sections';
import {
  isVariantShell,
  type PageShellProps,
  type ShellAside,
  type StandardShellProps,
} from './shell-types';
import { ShellInsetContext } from './shell-inset';
import { PageIconContext, activeSectionIcon } from './page-icon';
import { RailHostContext } from './rail-host-context';
import { RailPublisher, besideHostedRail, railSectionsOf, withoutSections } from './rail-publish';
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
  const rail = sectionRailOf(phone, area, railFormOf(shell.sections));
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

function useFabAction(shell: StandardShellProps): PrimaryActionProps | undefined {
  const placement = usePrimaryActionPlacement();
  return placement === 'fab' && !selecting(shell) ? shell.primaryAction : undefined;
}

interface AmbientTop {
  readonly top: number | null | undefined;
  readonly onTop: ((height: number) => void) | null;
}

function useAmbientTop(scroll: boolean): AmbientTop {
  const [top, setTop] = useState<number | null>(null);
  return scroll ? { top: undefined, onTop: null } : { top, onTop: setTop };
}

function ShellAmbient({ top }: { readonly top: number | null | undefined }): ReactNode {
  if (top === undefined) return <Ambient />;
  return top === null ? null : <Ambient height={top} />;
}

function ShellProviders({
  value,
  anchor,
  width,
  title,
  top,
  children,
}: {
  readonly value: ScreenValue;
  readonly anchor: ScreenScroll | null;
  readonly width: number;
  readonly title: string;
  readonly top: number | null | undefined;
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
            <ShellAmbient top={top} />
            {children}
          </KeyboardViewport>
        </BodyWidthContext>
      </ScreenScrollContext>
    </ScreenContext>
  );
}

interface HostedShell {
  readonly shell: StandardShellProps;
  readonly layout: ShellLayout;
  readonly publisher: ReactNode;
}

function useHostedShell(props: StandardShellProps): HostedShell {
  const host = use(RailHostContext);
  const own = useShellLayout(props);
  if (host === null) return { shell: props, layout: own, publisher: null };
  const sections = railSectionsOf(props, own);
  return {
    shell: sections === null ? props : withoutSections(props),
    layout: sections === null ? own : besideHostedRail(own),
    publisher: <RailPublisher host={host} sections={sections} />,
  };
}

function StandardShell(props: StandardShellProps): ReactNode {
  const { shell, layout, publisher } = useHostedShell(props);
  const scrollY = useSharedValue(0);
  const tick = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scroll = shell.scroll !== false;
  const ambient = useAmbientTop(scroll);
  const fabAction = useFabAction(shell);
  const value = useShellValue(scrollY, scroll ? scrollRef : null, shell.primaryAction, scroll);
  const anchor = useScrollAnchor(scroll, scrollRef, scrollY, tick);
  const phone = layout.header === 'large';
  const tabIcon = use(PageIconContext);
  const frame: FrameProps = {
    shell,
    layout,
    scrollY,
    scrollRef,
    fab: fabAction !== undefined,
    icon: activeSectionIcon(props.sections) ?? tabIcon,
    onTop: ambient.onTop,
  };
  return (
    <ShellProviders
      value={value}
      anchor={anchor}
      width={layout.column.width}
      title={shell.title}
      top={ambient.top}
    >
      {publisher}
      <View className="min-h-0 flex-1">
        {phone ? <PhoneFrame {...frame} /> : <WideFrame {...frame} />}
        {fabAction === undefined ? null : <PrimaryAction {...fabAction} />}
      </View>
      {!phone || shell.footer === undefined ? null : (
        <ShellFooter hides={shell.footerHides}>{shell.footer}</ShellFooter>
      )}
      {shell.aside === undefined || layout.docked ? null : <AsideSheet aside={shell.aside} />}
    </ShellProviders>
  );
}

export function PageShell(shell: PageShellProps): ReactNode {
  if (!isVariantShell(shell)) return <StandardShell {...shell} />;
  return shell.variant === 'overlay' ? <OverlayShell {...shell} /> : <PaneShell {...shell} />;
}
