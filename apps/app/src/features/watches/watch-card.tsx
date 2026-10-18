import type { ReactNode } from 'react';
import { Badge } from '../../components/badge';
import { Text } from '../../components/text';
import { count } from '../../format/number';
import { useRow } from '../../store/selectors';
import type { Device } from '../../store/state';
import { DeviceVisual, useWatchVisualState, type VisualState } from '../device-visuals';
import {
  GenericCardFace,
  WIDE_VISUAL_PX,
  WideCard,
  isWideClass,
  type CardFaceProps,
  type WideClass,
} from '../devices';
import { useWatchPulse } from './use-watch-heart';
import {
  headlineOf,
  lowBattery,
  stateLineOf,
  syncControlOf,
  type Headline,
  type SyncControl,
} from './watch-card-model';
import {
  BatteryAndOxygen,
  GoalRings,
  HeartFigure,
  HeartGraph,
  SetupAction,
  StepsFigure,
  StepsGraph,
  SyncAction,
} from './watch-card-parts';
import { FindWatchButton } from './watch-find';
import { useWatchGlance, type WatchGlance } from './watch-glance';
import { beatingBpm, type HeartView } from './watch-heart';
import { useRinging } from './watch-ringing';

const HEART_HEIGHT: Readonly<Record<WideClass, number>> = { m: 34, w: 52, l: 120, xl: 120 };

function textOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

interface WatchCardData {
  readonly glance: WatchGlance;
  readonly heart: HeartView | null;
  readonly lastSeen: number | null;
  readonly headline: Headline;
  readonly sync: SyncControl;
  readonly line: string;
  readonly state: VisualState;
  readonly neverReported: boolean;
}

function useWatchCardData(device: Device): WatchCardData {
  const { glance, live, phone } = useWatchGlance(device);
  const { heart, lastSeen } = useWatchPulse(device, phone);
  const ringing = useRinging(device.id);
  const owner = useRow('profiles', textOf(device.details['profileId']))?.name ?? null;
  const state = useWatchVisualState(device, { ...live, heartRate: beatingBpm(heart) });
  return {
    glance,
    heart,
    lastSeen,
    state,
    headline: headlineOf(glance, lastSeen),
    sync: syncControlOf(glance, owner),
    line: stateLineOf({ facts: glance, lastSeen, owner, ringing }),
    neverReported: !glance.onThisPhone && textOf(device.details['reportedAt']) === null,
  };
}

function summaryOf(device: Device, data: WatchCardData): string {
  const heart = data.heart === null ? '' : `, heart rate ${String(data.heart.bpm)}`;
  return `${device.label}, ${data.headline.label}${heart}, ${count(data.glance.steps?.value ?? 0)} steps`;
}

function figuresOf(data: WatchCardData): readonly ReactNode[] {
  const stale = data.lastSeen !== null;
  return [
    data.heart === null ? null : <HeartFigure key="heart" view={data.heart} stale={stale} />,
    <StepsFigure key="steps" glance={data.glance} stale={stale} />,
  ].filter((figure) => figure !== null);
}

function graphOf(device: Device, cls: WideClass, data: WatchCardData): ReactNode {
  const { glance } = data;
  if (glance.worn !== true || data.lastSeen !== null || glance.charging) {
    return <StepsGraph glance={glance} />;
  }
  return (
    <>
      <HeartGraph device={device} height={HEART_HEIGHT[cls]} />
      {cls === 'w' ? <BatteryAndOxygen device={device} battery={glance.battery} /> : null}
    </>
  );
}

function actionsOf(device: Device, data: WatchCardData): readonly ReactNode[] {
  if (data.neverReported) {
    return [<SetupAction key="setup" />];
  }
  const sync = <SyncAction key="sync" control={data.sync} />;
  return data.lastSeen === null
    ? [<FindWatchButton key="find" device={device} lastSeen={null} />, sync]
    : [sync];
}

function WatchWide({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const data = useWatchCardData(device);
  return (
    <WideCard
      cls={cls}
      title={device.label}
      summary={summaryOf(device, data)}
      visual={
        <DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} state={data.state} />
      }
      chip={<Badge label={data.headline.label} tone={data.headline.tone} />}
      state={
        <Text
          variant="footnote"
          tone={lowBattery(data.glance) ? 'warning' : 'variant'}
          numberOfLines={1}
        >
          {data.line}
        </Text>
      }
      figures={figuresOf(data)}
      graph={graphOf(device, cls, data)}
      actions={actionsOf(device, data)}
      {...(cls === 'l' || cls === 'xl'
        ? { log: <GoalRings device={device} glance={data.glance} /> }
        : {})}
    />
  );
}

export function WatchCard(props: CardFaceProps): ReactNode {
  const { device, cls } = props;
  return isWideClass(cls) ? (
    <WatchWide device={device} cls={cls} />
  ) : (
    <GenericCardFace {...props} />
  );
}
