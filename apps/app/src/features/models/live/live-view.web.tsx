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
import { browserScheduler } from './frame-loop';
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

function layoutKey(): string {
  const parts: string[] = [];
  for (const [id, target] of placed) {
    for (const element of [target.element, ...target.clips]) {
      const { x, y, width, height } = rectOf(element);
      parts.push(`${id}:${String(x)},${String(y)},${String(width)},${String(height)}`);
    }
  }
  return parts.join('|');
}

function watchLayout(onMoved: () => void): () => void {
  let last = layoutKey();
  const check = (): void => {
    const next = layoutKey();
    if (next === last) return;
    last = next;
    onMoved();
  };
  const sizes = new ResizeObserver(check);
  const observePlaced = (): void => {
    sizes.disconnect();
    for (const target of placed.values()) {
      sizes.observe(target.element);
      for (const clip of target.clips) sizes.observe(clip);
    }
    last = layoutKey();
  };
  const mutations = new MutationObserver(check);
  mutations.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  placementEvents.add(observePlaced);
  observePlaced();
  return (): void => {
    placementEvents.delete(observePlaced);
    mutations.disconnect();
    sizes.disconnect();
  };
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
          watchLayout,
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
  const level = useStillFade(live && drawn);
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
        {still}
      </Animated.View>
    </View>
  );
}
