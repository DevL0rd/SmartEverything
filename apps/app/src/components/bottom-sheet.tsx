import type { ReactNode, RefObject } from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetBody } from './sheet-body';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cn } from '../design/cn';
import { DURATION, EASING, SPRING, useMotion } from '../design/motion';
import {
  CHROME_SURFACE,
  COMPACT_PANEL_INSET,
  FLOATING_SHEET_SURFACE,
  floatingSheetFrame,
} from './compact-panel';
import { focusView } from './focus-request';
import { Overlay, useOverlayShown } from './overlay';
import { SheetHandle, useSheetHeading, type SheetBackAction } from './sheet-header';
import { SheetNavigationProvider, useSheetNavigation } from './sheet-navigation';
import { sheetFrame } from './sheet-frame';
import { EscapeScopeVisible } from './use-escape';

export type Detent = 'fit' | 'half' | 'full';

const FULL_SHARE = 0.92;
const HALF_SHARE = 0.75;
const CLOSE_VELOCITY = 1200;
const FIXED_SHEET_CLIP = 'overflow-hidden rounded-b-xl web:overflow-clip';

export interface BottomSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly title?: string | undefined;
  readonly label: string;
  readonly detents: readonly Detent[];
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly reading?: boolean;
  readonly compact?: boolean;
  readonly preview?: ReactNode;
  readonly children: ReactNode;
}

function restingOffset(detents: readonly Detent[], full: number): number {
  return detents[0] === 'half' ? full - full * (HALF_SHARE / FULL_SHARE) : 0;
}

function snapOf(
  offset: number,
  velocity: number,
  stops: readonly number[],
  full: number,
): number | null {
  'worklet';
  if (velocity > CLOSE_VELOCITY || offset > full * 0.75) {
    return null;
  }
  return stops.reduce((best, stop) =>
    Math.abs(stop - offset) < Math.abs(best - offset) ? stop : best,
  );
}

interface SheetOffsetTarget {
  readonly full: number;
  readonly initial: number;
  readonly rest: number;
  readonly ready: boolean;
  readonly page: string | undefined;
  readonly titleFocus: RefObject<View | null> | undefined;
}

function useSheetOffset({
  full,
  initial,
  rest,
  ready,
  page,
  titleFocus,
}: SheetOffsetTarget): SharedValue<number> {
  const { reduced } = useMotion();
  const markShown = useOverlayShown();
  const focused = useRef(false);
  const shown = (): void => {
    markShown();
    if (!focused.current && titleFocus !== undefined) {
      focused.current = focusView(titleFocus.current, true);
    }
  };
  const offset = useSharedValue(full);
  const moveToRest = useEffectEvent((): void => {
    if (reduced) {
      offset.set(rest);
      shown();
      return;
    }
    offset.set(
      withTiming(rest, { duration: DURATION.medium, easing: EASING.decelerate }, (finished) => {
        'worklet';
        if (finished === true) {
          scheduleOnRN(shown);
        }
      }),
    );
  });
  useEffect(() => {
    if (ready) moveToRest();
  }, [full, initial, ready, reduced, page]);
  return offset;
}

interface DragTargets {
  readonly stops: readonly number[];
  readonly extent: SharedValue<number>;
  readonly onClose: () => void;
  readonly onSettle: (expanded: boolean) => void;
}

function useDragToDismiss(
  offset: SharedValue<number>,
  { stops, extent, onClose, onSettle }: DragTargets,
): PanGesture {
  const start = useSharedValue(0);
  return Gesture.Pan()
    .onBegin(() => {
      start.set(offset.get());
    })
    .onUpdate((event) => {
      offset.set(Math.max(0, start.get() + event.translationY));
    })
    .onEnd((event) => {
      const target = snapOf(offset.get(), event.velocityY, stops, extent.get());
      if (target === null) {
        scheduleOnRN(onClose);
        return;
      }
      scheduleOnRN(onSettle, target === 0);
      offset.set(withSpring(target, SPRING));
    });
}

interface PanelProps {
  readonly onClose: () => void;
  readonly title: string | undefined;
  readonly label: string;
  readonly back: SheetBackAction | undefined;
  readonly detents: readonly Detent[];
  readonly full: number;
  readonly compact: boolean;
  readonly expanded: boolean;
  readonly onExpanded: (expanded: boolean) => void;
  readonly reading?: boolean;
  readonly children: (body: string, hidden: number) => ReactNode;
}

function SheetPanel(props: PanelProps): ReactNode {
  const { onClose, title, back, detents, full, compact, expanded, onExpanded, reading } = props;
  const titleFocus = useSheetHeading(reading);
  const [measurement, setMeasurement] = useState<{
    readonly page: string | undefined;
    readonly height: number;
  } | null>(null);
  const page = back?.key;
  const measuredHeight = measurement?.page === page ? measurement?.height : undefined;
  const initial = restingOffset(detents, measuredHeight ?? full);
  const rest = expanded ? 0 : initial;
  const stops = detents.includes('full') ? [0, initial] : [initial];
  const offset = useSheetOffset({
    full,
    initial,
    rest,
    ready: measurement !== null,
    page,
    titleFocus,
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const extent = useSharedValue(full);
  const pan = useDragToDismiss(offset, { stops, extent, onClose, onSettle: onExpanded });
  const onLayout = ({ nativeEvent }: LayoutChangeEvent): void => {
    const { height } = nativeEvent.layout;
    extent.set(height);
    setMeasurement((previous) =>
      previous?.height === height && previous.page === page ? previous : { page, height },
    );
  };
  const { sized, body } = sheetFrame(detents, full);
  return (
    <Animated.View
      onLayout={onLayout}
      style={[sized, slide]}
      className={cn('min-h-0 w-full shrink', CHROME_SURFACE, FLOATING_SHEET_SURFACE)}
    >
      <GestureDetector gesture={pan}>
        <SheetHandle
          title={title}
          onClose={onClose}
          compact={compact}
          back={back}
          titleFocus={titleFocus}
        />
      </GestureDetector>
      {props.children(body, rest)}
    </Animated.View>
  );
}

interface PanelBodyProps {
  readonly compact: boolean;
  readonly scroll: boolean;
  readonly fit: boolean;
  readonly footer: ReactNode;
  readonly children: ReactNode;
  readonly className: string;
  readonly hidden: number;
  readonly visible: boolean;
  readonly reading?: boolean;
  readonly subpage?: boolean;
}

function PanelBody({
  compact,
  scroll,
  fit,
  footer,
  children,
  className,
  hidden,
  visible,
  reading = false,
  subpage = false,
}: PanelBodyProps): ReactNode {
  const padding = { paddingBottom: hidden };
  const footerInset = compact
    ? cn(COMPACT_PANEL_INSET, subpage && 'pb-3 pt-2')
    : cn('px-4 pb-4 pt-2', reading && 'border-t border-outline-variant');
  return (
    <EscapeScopeVisible value={visible}>
      <View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        style={padding}
        className={cn(className, !visible && 'hidden')}
      >
        <SheetBody
          scroll={scroll}
          fit={fit}
          fill={reading && !fit}
          reading={reading}
          padding={compact ? cn(COMPACT_PANEL_INSET, 'pb-1') : 'px-4 pb-0'}
        >
          {children}
        </SheetBody>
        {footer === undefined ? null : (
          <View className={cn('flex-row gap-3', footerInset)}>{footer}</View>
        )}
      </View>
    </EscapeScopeVisible>
  );
}

type PageStack = ReturnType<typeof useSheetNavigation>['pages'];

interface PageBodiesProps {
  readonly root: Pick<BottomSheetProps, 'children' | 'footer' | 'scroll' | 'compact' | 'reading'>;
  readonly pages: PageStack;
  readonly body: string;
  readonly fit: boolean;
  readonly hidden: number;
}

function PageBodies({ root, pages, body, fit, hidden }: PageBodiesProps): ReactNode {
  return (
    <>
      <PanelBody
        compact={root.compact === true}
        scroll={root.scroll !== false}
        fit={fit}
        footer={root.footer}
        className={body}
        hidden={hidden}
        reading={root.reading === true}
        visible={pages.length === 0}
      >
        {root.children}
      </PanelBody>
      {pages.map(({ id, page }, index) => (
        <PanelBody
          key={id}
          compact={page.compact !== false}
          scroll={page.scroll !== false}
          fit={fit}
          footer={page.footer}
          className={body}
          hidden={hidden}
          visible={index === pages.length - 1}
          subpage
        >
          {page.children}
        </PanelBody>
      ))}
    </>
  );
}

const FIT: readonly Detent[] = ['fit'];

export function BottomSheet({ open, ...props }: BottomSheetProps): ReactNode {
  return open ? <OpenBottomSheet {...props} /> : null;
}

type RootSheet = Omit<BottomSheetProps, 'open'>;
type Navigation = ReturnType<typeof useSheetNavigation>;
type VisiblePanel = Omit<PanelProps, 'onClose' | 'full' | 'children'>;

interface VisibleSheet {
  readonly panel: VisiblePanel;
  readonly preview: ReactNode;
  readonly backdropLabel?: string;
}

function useVisibleSheet(props: RootSheet, navigation: Navigation): VisibleSheet {
  const [rootExpanded, setRootExpanded] = useState(false);
  const active = navigation.pages.at(-1);
  if (active === undefined) {
    return {
      panel: {
        title: props.title,
        label: props.label,
        back: undefined,
        detents: props.detents,
        compact: props.compact === true,
        expanded: rootExpanded,
        onExpanded: setRootExpanded,
      },
      preview: props.preview,
    };
  }
  const title = active.page.title;
  const parent = navigation.pages.at(-2)?.page.title ?? props.title ?? props.label;
  return {
    panel: {
      title,
      label: title,
      back: {
        key: active.id,
        label: `Back to ${parent}`,
        onPress: navigation.back,
        focus: active.focusBack,
      },
      detents: active.page.detents ?? FIT,
      compact: active.page.compact !== false,
      expanded: active.expanded,
      onExpanded: (expanded): void => {
        navigation.setExpanded(active.id, expanded);
      },
    },
    preview: null,
    backdropLabel: `Dismiss ${title}`,
  };
}

function OpenBottomSheet(props: RootSheet): ReactNode {
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { left, width, bottom, maxHeight } = floatingSheetFrame(viewport, insets);
  const navigation = useSheetNavigation(props.onClose);
  const { panel, preview, backdropLabel } = useVisibleSheet(props, navigation);
  const fit = panel.detents.includes('fit');
  const full = fit ? maxHeight : Math.min(viewport.height * FULL_SHARE, maxHeight);
  const frame = { marginLeft: left, marginBottom: bottom, width, maxHeight };
  return (
    <Overlay
      open
      onClose={navigation.back}
      onBack={navigation.pages.length === 0 ? props.onBack : navigation.back}
      label={panel.label}
      backdropLabel={backdropLabel}
      pointerBackdrop={props.reading}
      scrim
      className="justify-end"
    >
      <View
        pointerEvents="box-none"
        className={cn('min-h-0 shrink gap-3', !fit && FIXED_SHEET_CLIP)}
        style={frame}
      >
        {preview}
        <SheetNavigationProvider navigation={navigation.navigation}>
          <SheetPanel
            {...panel}
            onClose={navigation.back}
            full={full}
            reading={props.reading === true}
          >
            {(body, hidden) => (
              <PageBodies
                root={props}
                pages={navigation.pages}
                body={body}
                fit={fit}
                hidden={hidden}
              />
            )}
          </SheetPanel>
        </SheetNavigationProvider>
      </View>
    </Overlay>
  );
}
