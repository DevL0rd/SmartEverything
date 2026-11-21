import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
import { Logger } from '@smarteverything/logging';
import { EASING } from '../../../design/motion';
import {
  releaseStageEnvironment,
  rendererEnvironment,
} from '../../../components/models/three/stage';
import { useStableCallback } from '../../../design/use-stable-callback';
import { FADE_IN_MS } from '../visual/model-visual';
import { StillCoveredContext } from '../visual/still-covered';
import { browserScheduler } from './frame-loop';
import { watchLayout, type LayoutWatchHost, type NodeWatch } from './layout-watch';
import { startCanvas, type CanvasGraphics, type RunningCanvas } from './live-canvas';
import { liveSurface } from './live-surface';
import { createLiveRenderer, type LiveRect, type LiveRenderer } from './renderer-core';
import { useForegroundBinding, useLiveView, type LiveModelViewProps } from './use-live-view';

export type { LiveModelViewProps } from './use-live-view';

const log = new Logger('app.models');

interface Placed {
  readonly element: HTMLElement;
  readonly clips: readonly HTMLElement[];
}

const placed = new Map<string, Placed>();

const surfaceEvents = new Set<() => void>();

const placementEvents = new Set<() => void>();

const CANVAS = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  pointerEvents: 'none',
  display: 'block',
} as const;

function clippingAncestors(element: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') found.push(at);
  }
  return found;
}

function rectOf(element: Element): LiveRect {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { x: left, y: top, width, height };
}

function clipOf(target: Placed): LiveRect {
  let clip: LiveRect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  for (const ancestor of target.clips) {
    const rect = rectOf(ancestor);
    const x = Math.max(clip.x, rect.x);
    const y = Math.max(clip.y, rect.y);
    const right = Math.min(clip.x + clip.width, rect.x + rect.width);
    const bottom = Math.min(clip.y + clip.height, rect.y + rect.height);
    clip = { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  }
  return clip;
}

function placeAll(renderer: LiveRenderer): void {
  for (const id of renderer.viewIds()) {
    const target = placed.get(id);
    if (target !== undefined) renderer.place(id, rectOf(target.element), clipOf(target));
  }
}

function invalidateSurface(): void {
  for (const listener of surfaceEvents) listener();
}

function placementChanged(): void {
  for (const listener of placementEvents) listener();
  invalidateSurface();
}

const STRUCTURE: MutationObserverInit = { childList: true, subtree: true };

const STYLE: MutationObserverInit = { attributes: true, attributeFilter: ['style', 'class'] };

function mutationWatch(options: MutationObserverInit) {
  return (onChange: () => void): NodeWatch<HTMLElement> => {
    const observer = new MutationObserver(onChange);
    return {
      observe: (node): void => {
        observer.observe(node, options);
      },
      disconnect: (): void => {
        observer.disconnect();
      },
    };
  };
}

function sizeWatch(onChange: () => void): NodeWatch<HTMLElement> {
  const observer = new ResizeObserver(onChange);
  return {
    observe: (node): void => {
      observer.observe(node);
    },
    disconnect: (): void => {
      observer.disconnect();
    },
  };
}

function* ancestorChain(target: Placed): Iterable<HTMLElement> {
  for (
    let at: HTMLElement | null = target.element;
    at !== null && at !== document.body;
    at = at.parentElement
  ) {
    yield at;
  }
}

function* elementChildren(node: HTMLElement): Iterable<HTMLElement> {
  for (const child of node.children) if (child instanceof HTMLElement) yield child;
}

const layoutHost: LayoutWatchHost<HTMLElement> = {
  targets: () => placed.values(),
  rectOf,
  scopeOf: (target) => target.clips[0] ?? document.body,
  chainOf: ancestorChain,
  childrenOf: elementChildren,
  watchSizes: sizeWatch,
  watchStructure: mutationWatch(STRUCTURE),
  watchStyle: mutationWatch(STYLE),
  scheduler: browserScheduler(),
  placementEvents,
};

function watchPlacedLayout(onMoved: () => void): () => void {
  return watchLayout(layoutHost, onMoved);
}

function openGraphics(canvas: HTMLCanvasElement): CanvasGraphics {
  const gl = new WebGLRenderer({ canvas, alpha: true, antialias: true, stencil: true });
  gl.setClearColor(0x000000, 0);
  gl.toneMapping = ACESFilmicToneMapping;
  return {
    renderer: createLiveRenderer(gl, rendererEnvironment(gl)),
    release: (): void => {
      releaseStageEnvironment(gl);
      gl.dispose();
    },
  };
}

export function LiveSurfaceHost(): ReactNode {
  useForegroundBinding();
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);
  const onRestored = useStableCallback((): void => {
    setGeneration((current) => current + 1);
  });
  const attach = useCallback(
    (canvas: HTMLCanvasElement | null): (() => void) | undefined => {
      if (canvas === null) return undefined;
      let running: RunningCanvas;
      try {
        running = startCanvas(canvas, {
          surface: liveSurface,
          scheduler: browserScheduler(),
          open: openGraphics,
          place: placeAll,
          watchLayout: watchPlacedLayout,
          onRestored,
        });
      } catch (error) {
        log.warn('model.live_webgl_missing', { detail: String(error) });
        setFailed(true);
        return undefined;
      }
      surfaceEvents.add(running.invalidate);
      return (): void => {
        surfaceEvents.delete(running.invalidate);
        running.dispose();
      };
    },
    [onRestored],
  );
  if (failed) return null;
  return <canvas key={generation} ref={attach} style={CANVAS} aria-hidden />;
}

function useStillFade(drawn: boolean): SharedValue<number> {
  const level = useSharedValue(1);
  useEffect(() => {
    level.set(withTiming(drawn ? 0 : 1, { duration: FADE_IN_MS, easing: EASING.fade }));
  }, [drawn, level]);
  return level;
}

function square(px: number): { readonly width: number; readonly height: number } {
  return { width: px, height: px };
}

function usePlacement(id: string, frame: RefObject<View | null>, live: boolean): void {
  useEffect(() => {
    const node: unknown = frame.current;
    if (!live || !(node instanceof HTMLElement)) return undefined;
    placed.set(id, { element: node, clips: clippingAncestors(node) });
    placementChanged();
    return (): void => {
      placed.delete(id);
      placementChanged();
    };
  }, [id, frame, live]);
}

export function LiveModelView(props: LiveModelViewProps): ReactNode {
  const { id, px, still } = props;
  const frame = useRef<View>(null);
  const { live, drawn, onLayout } = useLiveView(props, frame);
  usePlacement(id, frame, live);
  const covered = live && drawn;
  const level = useStillFade(covered);
  const stillStyle = useAnimatedStyle(() => ({ opacity: level.get() }));
  return (
    <View
      ref={frame}
      onLayout={onLayout}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={square(px)}
    >
      <Animated.View className="absolute inset-0" style={stillStyle}>
        <StillCoveredContext value={covered}>{still}</StillCoveredContext>
      </Animated.View>
    </View>
  );
}
