import type { ModelSpec } from '@smarteverything/domain';
import { use, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { ChannelSignals } from '../../../components/models/channels';
import { buildModel, type BuiltModel } from '../../../components/models/three/build-model';
import { frameView } from '../../../components/models/three/framing';
import { useStableCallback } from '../../../design/use-stable-callback';
import {
  INSPECT_START,
  clampInspect,
  dragInspect,
  inspectPose,
  partReadout,
  partTitle,
  pickPart,
  readingText,
  zoomInspect,
  type LiveInspect,
  type PartReadout,
} from './inspect';
import { HeroInspectContext } from './hero-inspect-context';
import { LiveModelView } from './live-view';
import type { LiveModelKey } from './model-cache';

export interface HeroModelViewProps {
  readonly id: string;
  readonly title: string;
  readonly spec: ModelSpec;
  readonly model: LiveModelKey;
  readonly px: number;
  readonly signals: ChannelSignals;
  readonly capabilities: ChannelSignals;
  readonly still: ReactNode;
}

function usePickModel(
  spec: ModelSpec,
  model: LiveModelKey,
  active: boolean,
): RefObject<BuiltModel | null> {
  const built = useRef<BuiltModel | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    const options = { lod: model.lod, finish: model.finish ?? undefined, params: model.params };
    const current = buildModel(spec, options);
    built.current = current;
    return (): void => {
      built.current = null;
      current.dispose();
    };
  }, [spec, model, active]);
  return built;
}

function settled(model: BuiltModel | null, spec: ModelSpec, next: LiveInspect): LiveInspect {
  return model === null ? next : clampInspect(next, frameView(model, spec, 'hero', 1));
}

interface TapAt {
  readonly inspect: LiveInspect;
  readonly x: number;
  readonly y: number;
  readonly px: number;
}

function picked(model: BuiltModel | null, spec: ModelSpec, at: TapAt): string | null {
  if (model === null) return null;
  const pose = inspectPose(frameView(model, spec, 'hero', 1), at.inspect);
  return pickPart(model, pose, { x: at.x, y: at.y, width: at.px, height: at.px });
}

interface InspectControls {
  readonly inspect: LiveInspect | null;
  readonly readout: PartReadout | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly reset: () => void;
  readonly gesture: ReturnType<typeof Gesture.Race>;
}

function useInspectGestures(
  props: HeroModelViewProps,
  state: {
    readonly inspect: LiveInspect | null;
    readonly setInspect: (next: LiveInspect | null) => void;
    readonly setPicked: (part: string | null) => void;
    readonly built: RefObject<BuiltModel | null>;
    readonly enabled: boolean;
  },
): ReturnType<typeof Gesture.Race> {
  const { px, spec } = props;
  const { inspect, setInspect, setPicked, built, enabled } = state;
  const base = useRef<LiveInspect>(INSPECT_START);
  const settle = useStableCallback((next: LiveInspect): void => {
    setInspect(settled(built.current, spec, next));
  });
  const begin = useStableCallback((): void => {
    base.current = inspect ?? INSPECT_START;
  });
  const drag = useStableCallback((dx: number, dy: number): void => {
    settle(dragInspect(base.current, { dx, dy, widthPx: px }));
  });
  const pinch = useStableCallback((scale: number): void => {
    settle(zoomInspect(base.current, scale));
  });
  const tap = useStableCallback((x: number, y: number): void => {
    if (inspect === null) setInspect(INSPECT_START);
    setPicked(picked(built.current, spec, { inspect: inspect ?? INSPECT_START, x, y, px }));
  });
  const free = Gesture.Pan().runOnJS(true).enabled(enabled);
  const pan = (inspect === null ? free.activeOffsetX([-8, 8]) : free.minDistance(4))
    .onBegin(begin)
    .onUpdate((event) => {
      drag(event.translationX, event.translationY);
    });
  const zoom = Gesture.Pinch()
    .runOnJS(true)
    .enabled(enabled)
    .onBegin(begin)
    .onUpdate((event) => {
      pinch(event.scale);
    });
  const press = Gesture.Tap()
    .runOnJS(true)
    .enabled(enabled)
    .onEnd((event) => {
      tap(event.x, event.y);
    });
  return Gesture.Race(Gesture.Simultaneous(pan, zoom), press);
}

function useInspect(props: HeroModelViewProps, shared: boolean): InspectControls {
  const { spec, model, signals, capabilities } = props;
  const [inspect, setInspect] = useState<LiveInspect | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const built = usePickModel(spec, model, inspect !== null);
  const enabled = !shared || inspect !== null;
  const gesture = useInspectGestures(props, { inspect, setInspect, setPicked, built, enabled });
  const readout = picked === null ? null : partReadout(spec, picked, { signals, capabilities });
  return {
    inspect,
    readout,
    start: (): void => {
      setInspect(INSPECT_START);
    },
    stop: (): void => {
      setInspect(null);
      setPicked(null);
    },
    reset: (): void => {
      setInspect(INSPECT_START);
      setPicked(null);
    },
    gesture,
  };
}

function Readout({ readout }: { readonly readout: PartReadout | null }): ReactNode {
  if (readout === null) {
    return (
      <Text variant="footnote" tone="variant" align="center">
        Drag to turn, pinch to zoom, tap a part to read it.
      </Text>
    );
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      className="w-full gap-1 rounded-md bg-surface-raised px-4 py-3"
    >
      <Text variant="body-strong">{partTitle(readout.part)}</Text>
      {readout.readings.length === 0 ? (
        <Text variant="footnote" tone="variant">
          This part has no live reading.
        </Text>
      ) : (
        readout.readings.map((reading) => (
          <Text key={`${reading.kind}:${reading.name}`} variant="footnote" tone="variant">
            {readingText(reading)}
          </Text>
        ))
      )}
    </View>
  );
}

function InspectBar({ controls }: { readonly controls: InspectControls }): ReactNode {
  const { inspect } = controls;
  if (inspect === null) {
    return <Button label="Inspect" icon="box" variant="outlined" onPress={controls.start} />;
  }
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-2">
      <Button label="Reset view" icon="reset" variant="text" onPress={controls.reset} />
      <Button label="Done" icon="close" variant="outlined" onPress={controls.stop} />
    </View>
  );
}

function useReportInspect(report: ((inspecting: boolean) => void) | null, on: boolean): void {
  useEffect(() => {
    if (report === null) return undefined;
    report(on);
    return (): void => {
      report(false);
    };
  }, [report, on]);
}

export function HeroModelView(props: HeroModelViewProps): ReactNode {
  const { id, title, spec, model, px, signals, still } = props;
  const report = use(HeroInspectContext);
  const shared = report !== null;
  const controls = useInspect(props, shared);
  const { inspect } = controls;
  useReportInspect(report, inspect !== null);
  const frame = { width: px, height: px };
  const live = inspect === null ? {} : { inspect };
  return (
    <View
      className={cn('items-center', shared ? 'gap-6' : 'gap-3')}
      pointerEvents={shared ? 'box-none' : 'auto'}
    >
      <GestureDetector gesture={controls.gesture}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`3D model of ${title}`}
          accessibilityHint="Drag to turn, pinch to zoom, tap a part to read it."
          collapsable={false}
          pointerEvents={shared && inspect === null ? 'none' : 'auto'}
          style={frame}
        >
          <LiveModelView
            id={id}
            spec={spec}
            model={model}
            view="hero"
            px={px}
            signals={signals}
            still={still}
            liveWhen="visible"
            {...live}
          />
        </View>
      </GestureDetector>
      {inspect === null ? null : <Readout readout={controls.readout} />}
      <InspectBar controls={controls} />
    </View>
  );
}
