import { useIsFocused } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState, View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { useOnScreen } from '../../../design/visibility';
import {
  DEFAULT_QUALITY_CONFIG,
  initialQuality,
  qualitySettings,
  recordFrame,
  type QualityConfig,
  type QualitySettings,
  type QualityState,
} from './quality-scaler';
import { visibilityRegistry, type VisibilityRegistry } from './registry';
import type { StageState } from './rules';

const log = new Logger('app.house-map');

const FILL = { flex: 1 } as const;

const LAYER = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

export interface StageLiveProps {
  readonly active: boolean;
  readonly quality: QualitySettings;
  readonly onReady: () => void;
  readonly onFrameTime: (frameMs: number) => void;
  readonly onUnavailable: () => void;
}

export interface StageStillState {
  readonly unavailable: boolean;
}

export type StageStill = ReactNode | ((state: StageStillState) => ReactNode);

export interface StageHostProps {
  readonly id: string;
  readonly still: StageStill;
  readonly renderLive: (props: StageLiveProps) => ReactNode;
  readonly modalCovered?: boolean;
  readonly registry?: VisibilityRegistry;
  readonly qualityConfig?: QualityConfig;
}

function useStageState(registry: VisibilityRegistry, id: string): StageState {
  const subscribe = useCallback(
    (listener: () => void) => registry.subscribeStage(id, listener),
    [registry, id],
  );
  const read = useCallback(() => registry.getStage(id), [registry, id]);
  return useSyncExternalStore(subscribe, read, read);
}

interface HostFacts {
  readonly onScreen: boolean;
  readonly screenFocused: boolean;
  readonly modalCovered: boolean;
}

function useRegistration(
  registry: VisibilityRegistry,
  id: string,
  { onScreen, screenFocused, modalCovered }: HostFacts,
): void {
  useEffect(() => registry.bindAppState(AppState), [registry]);
  useEffect(() => registry.register(id), [registry, id]);
  useEffect(() => {
    registry.report(id, { onScreen, screenFocused, modalCovered });
  }, [registry, id, onScreen, screenFocused, modalCovered]);
}

interface Scaler {
  readonly quality: QualitySettings;
  readonly onFrameTime: (frameMs: number) => void;
}

function useScaler(id: string, config: QualityConfig): Scaler {
  const state = useRef<QualityState>(initialQuality());
  const [quality, setQuality] = useState(() => qualitySettings(initialQuality(), config));
  const onFrameTime = useCallback(
    (frameMs: number): void => {
      const before = state.current.level;
      state.current = recordFrame(state.current, frameMs, config);
      if (state.current.level !== before) {
        log.debug('stage.quality_step', { id, level: state.current.level });
        setQuality(qualitySettings(state.current, config));
      }
    },
    [id, config],
  );
  return { quality, onFrameTime };
}

function StillLayer({
  registry,
  id,
  children,
}: {
  readonly registry: VisibilityRegistry;
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  useEffect(
    () => (): void => {
      registry.report(id, { stillReady: false });
    },
    [registry, id],
  );
  const drawn = useCallback((): void => {
    registry.report(id, { stillReady: true });
  }, [registry, id]);
  return (
    <View onLayout={drawn} style={LAYER} pointerEvents="none">
      {children}
    </View>
  );
}

interface LiveLayerProps {
  readonly registry: VisibilityRegistry;
  readonly id: string;
  readonly still: ReactNode;
  readonly stillShown: boolean;
  readonly live: boolean;
  readonly scaler: Scaler;
  readonly renderLive: (props: StageLiveProps) => ReactNode;
  readonly onUnavailable: () => void;
}

function LiveLayer(props: LiveLayerProps): ReactNode {
  const { registry, id, scaler } = props;
  const [loaded, setLoaded] = useState(false);
  const onReady = useCallback((): void => {
    setLoaded(true);
  }, []);
  return (
    <>
      <View style={LAYER}>
        {props.renderLive({
          active: props.live,
          quality: scaler.quality,
          onReady,
          onFrameTime: scaler.onFrameTime,
          onUnavailable: props.onUnavailable,
        })}
      </View>
      {loaded || props.stillShown ? null : (
        <StillLayer registry={registry} id={id}>
          {props.still}
        </StillLayer>
      )}
    </>
  );
}

function drawStill(still: StageStill, state: StageStillState): ReactNode {
  return typeof still === 'function' ? still(state) : still;
}

function useUnavailable(id: string): readonly [boolean, () => void] {
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback((): void => {
    log.info('stage.unavailable', { id });
    setUnavailable(true);
  }, [id]);
  return [unavailable, onUnavailable];
}

export function StageHost(props: StageHostProps): ReactNode {
  const { id, still } = props;
  const registry = props.registry ?? visibilityRegistry;
  const frame = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(frame);
  const screenFocused = useIsFocused();
  const modalCovered = props.modalCovered === true;
  useRegistration(registry, id, { onScreen: visible, screenFocused, modalCovered });
  const state = useStageState(registry, id);
  const scaler = useScaler(id, props.qualityConfig ?? DEFAULT_QUALITY_CONFIG);
  const [unavailable, onUnavailable] = useUnavailable(id);
  const mountLive = state.mounted && !unavailable;
  const stillShown = state.showStill || !mountLive;
  return (
    <View ref={frame} onLayout={onLayout} collapsable={false} style={FILL}>
      {mountLive ? (
        <LiveLayer
          registry={registry}
          id={id}
          still={drawStill(still, { unavailable })}
          stillShown={stillShown}
          live={state.live}
          scaler={scaler}
          renderLive={props.renderLive}
          onUnavailable={onUnavailable}
        />
      ) : null}
      {stillShown ? (
        <StillLayer registry={registry} id={id}>
          {drawStill(still, { unavailable })}
        </StillLayer>
      ) : null}
    </View>
  );
}
