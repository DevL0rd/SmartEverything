import { use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PixelRatio, useWindowDimensions, type View } from 'react-native';
import { useNavigationContainerRef } from 'expo-router';
import Animated, {
  makeMutable,
  measure,
  useAnimatedRef,
  type MeasuredDimensions,
  type SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Logger } from '@smarteverything/logging';
import { useInsideOverlay } from '../../../components/overlay-shown';
import { ScreenScrollContext } from '../../../components/screen-context';
import { WidgetMotionFrameContext } from '../../../components/widget-board/widget-scope';
import { useForeground } from '../../../design/animation-gate';
import { useStableCallback } from '../../../design/use-stable-callback';
import LiveOverlay from './live-overlay';
import {
  LIVE_PAINT,
  activeSpecKeys,
  placementOf,
  wireSync,
  type LiveOverlayHandle,
  type LivePlacement,
} from './live-protocol';
import { liveSurface } from './live-surface';
import { RoutePaint } from './route-paint';
import { NativeModelFace } from './native-model-face';
import { ScrollModelContext, ScrollModelLayer } from './scroll-model-layer';
import { ScrollModelView } from './scroll-model-view';
import { useForegroundBinding, useLiveView, type LiveModelViewProps } from './use-live-view';

export type { LiveModelViewProps } from './use-live-view';

const log = new Logger('app.models');

type ModelBoxes = Readonly<Record<string, readonly number[]>>;

const pendingBoxes = makeMutable<ModelBoxes>({});
const placements = new Map<string, LivePlacement>();
const placementListeners = new Set<() => void>();

function applyBoxes(boxes: ModelBoxes): void {
  let changed = false;
  for (const [id, box] of Object.entries(boxes)) {
    if (!liveSurface.set.isLive(id)) continue;
    placements.set(id, placementOf(box));
    changed = true;
  }
  if (changed) for (const notify of placementListeners) notify();
}

function placeOnNextBridgeTurn(id: string, box: readonly number[]): void {
  'worklet';
  const pending = pendingBoxes.get();
  pendingBoxes.set({ ...pending, [id]: box });
  if (Object.keys(pending).length !== 0) return;
  queueMicrotask(() => {
    const boxes = pendingBoxes.get();
    pendingBoxes.set({});
    scheduleOnRN(applyBoxes, boxes);
  });
}

const slot: { current: LiveOverlayHandle | null } = { current: null };

const FILL = { flex: 1, backgroundColor: 'transparent' } as const;

let overlayWanted = false;

function wantOverlay(): boolean {
  overlayWanted = liveSurface.live().length > 0 || (overlayWanted && liveSurface.joinedCount() > 0);
  return overlayWanted;
}

function readWanted(): boolean {
  return overlayWanted;
}

function subscribeWanted(listener: () => void): () => void {
  return liveSurface.subscribe(() => {
    const before = overlayWanted;
    if (wantOverlay() !== before) listener();
  });
}

function useMounted(): boolean {
  return useSyncExternalStore(subscribeWanted, readWanted, readWanted);
}

function useOverlayWire(
  ready: boolean,
  routePaint: RoutePaint,
  visible: SharedValue<boolean>,
): void {
  const sent = useRef(new Set<string>());
  const { width, height } = useWindowDimensions();
  const navigation: Pick<
    ReturnType<typeof useNavigationContainerRef>,
    'isReady' | 'addListener'
  > & {
    readonly getCurrentRoute: () => { readonly key: string } | undefined;
  } = useNavigationContainerRef();
  useEffect(() => {
    sent.current = new Set();
    const sync = (): void => {
      if (!ready) return;
      const views = liveSurface.live(routePaint.route);
      const wire = wireSync(routePaint.generation, views, sent.current);
      slot.current?.sync(JSON.stringify(wire));
      sent.current = activeSpecKeys(views);
    };
    const place = (): void => {
      if (!ready) return;
      const message = {
        width,
        height,
        dpr: PixelRatio.get(),
        placements: Object.fromEntries(placements),
      };
      slot.current?.place(JSON.stringify(message));
    };
    const routeChanged = (): void => {
      if (!navigation.isReady()) return;
      const current: { readonly key: string } | undefined = navigation.getCurrentRoute();
      if (!routePaint.select(current?.key ?? null)) return;
      visible.set(false);
      liveSurface.clearDrawn();
      sync();
      place();
    };
    const offRoute = navigation.addListener('state', routeChanged);
    routeChanged();
    if (!ready) return offRoute;
    const offSync = liveSurface.subscribe(sync);
    placementListeners.add(place);
    sync();
    place();
    return (): void => {
      offRoute();
      offSync();
      placementListeners.delete(place);
    };
  }, [ready, width, height, navigation, routePaint, visible]);
}

interface OverlayEvents {
  readonly generation: number;
  readonly ready: boolean;
  readonly unavailable: boolean;
  readonly drop: (cause: string) => void;
  readonly onReady: () => Promise<void>;
  readonly onDrawn: (generation: number, ids: readonly string[]) => Promise<void>;
  readonly onLost: (cause: string) => Promise<void>;
  readonly onUnavailable: (detail: string) => Promise<void>;
}

function useOverlayEvents(routePaint: RoutePaint, visible: SharedValue<boolean>): OverlayEvents {
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const drop = useStableCallback((cause: string): void => {
    log.warn('model.live_surface_lost', { cause, generation });
    setReady(false);
    routePaint.invalidate();
    visible.set(false);
    liveSurface.clearDrawn();
    setGeneration((current) => current + 1);
  });
  const onReady = useStableCallback((): Promise<void> => {
    setReady(true);
    return Promise.resolve();
  });
  const onDrawn = useStableCallback((epoch: number, ids: readonly string[]): Promise<void> => {
    const [painted, drawn] = LIVE_PAINT.parse([epoch, ids]);
    if (routePaint.accepts(painted)) {
      visible.set(drawn.length > 0);
      liveSurface.frameDrawn(drawn);
    }
    return Promise.resolve();
  });
  const onLost = useStableCallback((cause: string): Promise<void> => {
    drop(cause);
    return Promise.resolve();
  });
  const onUnavailable = useStableCallback((detail: string): Promise<void> => {
    log.warn('model.live_webgl_missing', { detail });
    setUnavailable(true);
    return Promise.resolve();
  });
  return { generation, ready, unavailable, drop, onReady, onDrawn, onLost, onUnavailable };
}

export function LiveSurfaceHost(): ReactNode {
  useForegroundBinding();
  const mounted = useMounted();
  const [routePaint] = useState(() => new RoutePaint());
  const visible = useSharedValue(false);
  const style = useAnimatedStyle(() => ({ opacity: visible.get() ? 1 : 0 }));
  const events = useOverlayEvents(routePaint, visible);
  const { generation, drop, onReady, onDrawn, onLost, onUnavailable } = events;
  useOverlayWire(events.ready && mounted, routePaint, visible);
  if (!mounted || events.unavailable) return null;
  return (
    <Animated.View
      style={style}
      className="absolute inset-0"
      pointerEvents="none"
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LiveOverlay
        key={generation}
        ref={slot}
        onReady={onReady}
        onDrawn={onDrawn}
        onLost={onLost}
        onUnavailable={onUnavailable}
        dom={{
          style: FILL,
          containerStyle: FILL,
          onContentProcessDidTerminate: () => {
            drop('content_process_terminated');
          },
          onRenderProcessGone: () => {
            drop('render_process_gone');
          },
        }}
      />
    </Animated.View>
  );
}

type ClipMeasure = (own: MeasuredDimensions | null) => MeasuredDimensions | null;

function useClipMeasure(): ClipMeasure {
  const scroll = use(ScreenScrollContext)?.scrollRef ?? null;
  const overlay = useInsideOverlay();
  return (own): MeasuredDimensions | null => {
    'worklet';
    if (overlay) return own;
    return scroll === null ? own : measure(scroll);
  };
}

function usePlacementSync(
  id: string,
  live: boolean,
  measureClip: ClipMeasure,
): ReturnType<typeof useAnimatedRef<View>> {
  const ref = useAnimatedRef<View>();
  const last = useSharedValue<readonly number[]>([]);
  const foreground = useForeground();
  const moving = live && foreground;
  const frame = useFrameCallback(() => {
    'worklet';
    const box = measure(ref);
    const clip = measureClip(box);
    const next =
      box === null || clip === null
        ? [0, 0, 0, 0]
        : [
            box.pageX,
            box.pageY,
            box.width,
            box.height,
            clip.pageX,
            clip.pageY,
            clip.width,
            clip.height,
          ];
    const prev = last.get();
    if (next.length === prev.length && next.every((value, index) => value === prev[index])) return;
    last.set(next);
    placeOnNextBridgeTurn(id, next);
  }, false);
  useEffect(() => {
    frame.setActive(moving);
    if (!moving) {
      last.set([]);
      placements.delete(id);
    }
    return (): void => {
      frame.setActive(false);
      placements.delete(id);
    };
  }, [frame, id, moving, last]);
  return ref;
}

function OverlayModelView(props: LiveModelViewProps): ReactNode {
  const { id, px, still } = props;
  const frame = useRef<View>(null);
  const { live, drawn, onLayout } = useLiveView(props, frame);
  const positioned = usePlacementSync(id, live, useClipMeasure());
  return (
    <NativeModelFace
      frame={frame}
      positioned={positioned}
      onLayout={onLayout}
      drawn={live ? drawn : false}
      px={px}
      still={still}
    />
  );
}

export function LiveModelView(props: LiveModelViewProps): ReactNode {
  const layer = use(ScrollModelContext);
  const motion = use(WidgetMotionFrameContext);
  if (layer !== null) return <ScrollModelView {...props} layer={layer} />;
  if (motion === null) return <OverlayModelView {...props} />;
  const size = { width: props.px, height: props.px };
  return (
    <ScrollModelLayer style={size} fillModel>
      <LiveModelView {...props} />
    </ScrollModelLayer>
  );
}
