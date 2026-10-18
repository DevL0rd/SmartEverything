import type { ReactNode } from 'react';
import { View } from 'react-native';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
import { isWideClass } from '../../../features/devices';
import type { Device } from '../../../store/state';
import { useRouterSnapshot, useSpeedTestRun, useSpeedTests } from '../router-data';
import { ServiceMedallion } from '../../shared/service-medallion';
import { ServiceNames } from '../../shared/service-names';
import { heroOf, type HeroModel } from './hero-model';
import { RouterCellFace } from './router-cell';
import { tileLine } from './tile-model';

function FaceMedallion({
  hero,
  running,
}: {
  readonly hero: HeroModel | null;
  readonly running: boolean;
}): ReactNode {
  return (
    <ServiceMedallion
      glyph="router"
      tone={hero?.tone ?? 'neutral'}
      ratio={hero?.ratio ?? null}
      live={running}
      size="widget"
      label={hero?.spoken ?? 'Router'}
      offline={hero?.stale ?? true}
    />
  );
}

function useFace(): {
  readonly hero: HeroModel | null;
  readonly line: string;
  readonly running: boolean;
} {
  const stream = useRouterSnapshot();
  const run = useSpeedTestRun();
  const tests = useSpeedTests();
  if (stream.state !== 'ready') {
    return { hero: null, line: 'Waiting for the router', running: run.running };
  }
  const last = tests.state === 'ready' ? (tests.tests[0] ?? null) : null;
  return {
    hero: heroOf(stream.value, last),
    line: tileLine(stream.value),
    running: run.running,
  };
}

export function RouterFace({
  device,
  size,
  showRoom,
}: {
  readonly device: Device;
  readonly size: string;
  readonly showRoom: boolean;
}): ReactNode {
  const { hero, line, running } = useFace();
  const compact = size === 'tile';
  const names = (
    <ServiceNames device={device} line={line} showRoom={showRoom} lines={compact ? 2 : 1} />
  );
  if (compact) {
    return (
      <View className="flex-1 justify-between gap-2" pointerEvents="none">
        <FaceMedallion hero={hero} running={running} />
        {names}
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row items-center gap-3" pointerEvents="none">
      <FaceMedallion hero={hero} running={running} />
      <View className="min-w-0 flex-1">{names}</View>
    </View>
  );
}

export function RouterCardFace({
  device,
  frame,
  size,
}: {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
  readonly size: string;
}): ReactNode {
  const cls = frameClassOf(frame);
  return isWideClass(cls) ? (
    <RouterCellFace device={device} cls={cls} />
  ) : (
    <RouterFace device={device} size={size} showRoom />
  );
}
