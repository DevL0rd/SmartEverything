import {
  createContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  PixelRatio,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedRef,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { background, Logger } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import LiveOverlay from './live-overlay';
import {
  LIVE_PAINT,
  activeSpecKeys,
  wireSync,
  type LiveOverlayHandle,
  type LivePlace,
  type LivePlacement,
} from './live-protocol';
import { LiveSurface } from './live-surface';
import type { LiveRect } from './renderer-core';

const log = new Logger('app.models');
const FILL = { flex: 1, backgroundColor: 'transparent' } as const;
const EMPTY_RECT = { x: 0, y: 0, width: 0, height: 0 } as const;

interface Size {
  readonly width: number;
  readonly height: number;
}

export class ScrollLayer {
  readonly surface = new LiveSurface();
  private readonly boxes = new Map<string, LiveRect>();
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly root: AnimatedRef<View>,
    readonly layout: SharedValue<number>,
    readonly fillModel = false,
  ) {}

  readonly wanted = (): boolean => this.surface.live().length > 0;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  readonly place = (id: string, rect: LiveRect | null): void => {
    const previous = this.boxes.get(id);
    if (rect === null) {
      if (!this.boxes.delete(id)) return;
    } else {
      if (
        previous?.x === rect.x &&
        previous.y === rect.y &&
        previous.width === rect.width &&
        previous.height === rect.height
      )
        return;
      this.boxes.set(id, rect);
    }
    if (this.surface.set.isLive(id)) {
      for (const listener of this.listeners) listener();
    }
  };

  readonly placements = (size: Size, dpr: number): LivePlace => {
    const clip = { x: 0, y: 0, ...size };
    const placements = Object.fromEntries(
      this.surface
        .live()
        .map(({ id }): readonly [string, LivePlacement] => [
          id,
          { rect: this.fillModel ? clip : (this.boxes.get(id) ?? EMPTY_RECT), clip },
        ]),
    );
    return { ...size, dpr, placements };
  };
}

export const ScrollModelContext = createContext<ScrollLayer | null>(null);

function useLayerWire(
  layer: ScrollLayer,
  handle: RefObject<LiveOverlayHandle | null>,
  size: Size,
  paint: Pick<LayerPaint, 'ready' | 'generation'>,
): void {
  const { ready, generation } = paint;
  useEffect(() => {
    if (!ready) return undefined;
    let sent = new Set<string>();
    let current = new Set<string>();
    const place = (): void => {
      handle.current?.place(JSON.stringify(layer.placements(size, PixelRatio.get())));
    };
    const sync = (): void => {
      const views = layer.surface.live();
      handle.current?.sync(JSON.stringify(wireSync(generation, views, sent)));
      sent = activeSpecKeys(views);
      if (views.some(({ id }) => !current.has(id))) place();
      current = new Set(views.map(({ id }) => id));
    };
    const stopSync = layer.surface.subscribe(sync);
    const stopPlace = layer.subscribe(place);
    sync();
    return (): void => {
      stopSync();
      stopPlace();
    };
  }, [layer, handle, size, ready, generation]);
}

interface LayerPaint {
  readonly ready: boolean;
  readonly visible: boolean;
  readonly unavailable: boolean;
  readonly generation: number;
  readonly onReady: () => Promise<void>;
  readonly onDrawn: (generation: number, ids: readonly string[]) => Promise<void>;
  readonly onLost: (cause: string) => Promise<void>;
  readonly onUnavailable: (detail: string) => Promise<void>;
}

function useLayerPaint(layer: ScrollLayer): LayerPaint {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [generation, setGeneration] = useState(0);
  const onReady = useStableCallback((): Promise<void> => {
    setReady(true);
    return Promise.resolve();
  });
  const onDrawn = useStableCallback((epoch: number, ids: readonly string[]): Promise<void> => {
    const [painted, drawn] = LIVE_PAINT.parse([epoch, ids]);
    if (painted === generation) {
      setVisible(drawn.length > 0);
      layer.surface.frameDrawn(drawn);
    }
    return Promise.resolve();
  });
  const onLost = useStableCallback((cause: string): Promise<void> => {
    log.warn('model.scroll_surface_lost', { cause });
    setReady(false);
    setVisible(false);
    layer.surface.clearDrawn();
    setGeneration((current) => current + 1);
    return Promise.resolve();
  });
  const onUnavailable = useStableCallback((detail: string): Promise<void> => {
    log.warn('model.scroll_webgl_missing', { detail });
    setUnavailable(true);
    return Promise.resolve();
  });
  return { ready, visible, unavailable, generation, onReady, onDrawn, onLost, onUnavailable };
}

function LayerCanvas({
  layer,
  size,
}: {
  readonly layer: ScrollLayer;
  readonly size: Size;
}): ReactNode {
  const handle = useRef<LiveOverlayHandle | null>(null);
  const paint = useLayerPaint(layer);
  const { visible, unavailable, generation, onReady, onDrawn, onLost, onUnavailable } = paint;
  useLayerWire(layer, handle, size, paint);
  useEffect(() => layer.surface.clearDrawn, [layer]);
  const style = { opacity: visible ? 1 : 0 };
  if (unavailable) return null;
  return (
    <View
      className="absolute inset-0 overflow-hidden"
      style={style}
      pointerEvents="none"
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LiveOverlay
        key={generation}
        ref={handle}
        onReady={onReady}
        onDrawn={onDrawn}
        onLost={onLost}
        onUnavailable={onUnavailable}
        dom={{
          style: FILL,
          containerStyle: FILL,
          onContentProcessDidTerminate: () => {
            background(onLost('content_process_terminated'), 'model.scroll_report_failed');
          },
          onRenderProcessGone: () => {
            background(onLost('render_process_gone'), 'model.scroll_report_failed');
          },
        }}
      />
    </View>
  );
}

export interface ScrollModelLayerProps {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly fillModel?: true;
}

export function ScrollModelLayer({ children, style, fillModel }: ScrollModelLayerProps): ReactNode {
  const root = useAnimatedRef<View>();
  const layout = useSharedValue(0);
  const [layer] = useState(() => new ScrollLayer(root, layout, fillModel));
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const wanted = useSyncExternalStore(layer.surface.subscribe, layer.wanted, layer.wanted);
  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
    layout.set((current) => current + 1);
  };
  return (
    <Animated.View
      ref={root}
      onLayout={onLayout}
      style={style}
      pointerEvents="box-none"
      collapsable={false}
    >
      <ScrollModelContext value={layer}>{children}</ScrollModelContext>
      {wanted && size.width > 0 && size.height > 0 ? (
        <LayerCanvas layer={layer} size={size} />
      ) : null}
    </Animated.View>
  );
}
