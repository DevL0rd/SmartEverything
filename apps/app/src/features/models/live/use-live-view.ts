import type { ModelSpec } from '@smarteverything/domain';
import { useIsFocused } from 'expo-router';
import {
  use,
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { AppState, type View } from 'react-native';
import { useUniwind } from 'uniwind';
import { visibilityRegistry } from '../../../components/house-map/live-visibility/registry';
import { useMotion } from '../../../design/motion';
import { ScreenRouteContext } from '../../../design/screen-route';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useOnScreen } from '../../../design/visibility';
import type { ChannelSignals } from '../../../components/models/channels';
import type { ModelView } from '../../../components/models/three/framing';
import { isFunctioning } from '../visual/model-visual';
import type { LiveInspect } from './inspect';
import { liveSurface, type LiveSurface, type LiveViewInput } from './live-surface';
import type { LiveModelKey } from './model-cache';

export interface LiveModelViewProps {
  readonly id: string;
  readonly spec: ModelSpec;
  readonly model: LiveModelKey;
  readonly view: ModelView;
  readonly px: number;
  readonly signals: ChannelSignals;
  readonly still: ReactNode;
  readonly liveWhen?: 'functioning' | 'visible';
  readonly inspect?: LiveInspect;
}

export interface LiveViewState {
  readonly live: boolean;
  readonly drawn: boolean;
  readonly onLayout: (() => void) | undefined;
}

export function useForegroundBinding(): void {
  useEffect(() => visibilityRegistry.bindAppState(AppState), []);
}

function useInput(props: LiveModelViewProps): LiveViewInput {
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const { reduced } = useMotion();
  const routeKey = use(ScreenRouteContext);
  const { spec, model, view, signals, liveWhen, inspect } = props;
  const functioning = liveWhen === 'visible' || isFunctioning(spec, signals);
  const input: LiveViewInput = {
    spec,
    model,
    view,
    signals,
    theme,
    reduced,
    functioning,
    routeKey,
  };
  return inspect === undefined ? input : { ...input, inspect };
}

function useJoined(id: string, input: LiveViewInput, surface: LiveSurface): void {
  const current = useStableCallback((): LiveViewInput => input);
  useEffect(() => surface.join(id, current()), [id, current, surface]);
  const { spec, model, view, signals, theme, reduced, functioning, routeKey, inspect } = input;
  useEffect(() => {
    const next = {
      spec,
      model,
      view,
      signals,
      theme,
      reduced,
      functioning,
      ...(routeKey === undefined ? {} : { routeKey }),
    };
    surface.update(id, inspect === undefined ? next : { ...next, inspect });
  }, [id, spec, model, view, signals, theme, reduced, functioning, routeKey, inspect, surface]);
}

export function useLiveView(
  props: LiveModelViewProps,
  frame: RefObject<View | null>,
  surface: LiveSurface = liveSurface,
  withinScrollViewport?: boolean,
): LiveViewState {
  const { id } = props;
  const input = useInput(props);
  useJoined(id, input, surface);
  const { visible, onLayout } = useOnScreen(frame, undefined, withinScrollViewport === undefined);
  const screenFocused = useIsFocused();
  useEffect(() => {
    surface.set.report(id, { onScreen: visible && (withinScrollViewport ?? true), screenFocused });
  }, [id, visible, withinScrollViewport, screenFocused, surface]);
  const readLive = useCallback(() => surface.set.isLive(id), [id, surface]);
  const live = useSyncExternalStore(surface.subscribe, readLive, readLive);
  const subscribeDrawn = useCallback(
    (listener: () => void) => surface.subscribeDrawn(id, listener),
    [id, surface],
  );
  const readDrawn = useCallback(() => surface.isDrawn(id), [id, surface]);
  const drawn = useSyncExternalStore(subscribeDrawn, readDrawn, readDrawn);
  return { live, drawn, onLayout };
}
