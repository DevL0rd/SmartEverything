import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { historyClassOf, type WatchTopic } from '@smarteverything/domain';
import { EmptyGraph, Sparkline, type ChartPoint } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useDeviceSeries } from '../../../queries/history';
import { useRingBackfill } from '../../../store/computer-backfill';
import { useLiveSeries } from '../../../store/computer-rings';
import type { Device } from '../../../store/state';
import { useLiveDemand } from '../../../store/use-live-demand';
import { sparkChoice } from './live-spark-model';

const HISTORY_HOURS = 24;
const DEFAULT_HEIGHT = 40;
const NO_RING: readonly ChartPoint[] = [];

interface LiveRing {
  readonly series: string;
  readonly topics: readonly WatchTopic[];
  readonly backfill?: readonly string[];
}

interface SparkLook {
  readonly colour: ColourRole;
  readonly height?: number;
  readonly domain?: readonly [number, number];
  readonly empty?: string;
}

export interface LiveSparkProps extends SparkLook {
  readonly device: Device;
  readonly capability: string;
  readonly ring?: LiveRing;
}

interface SeriesInput {
  readonly device: Device;
  readonly capability: string;
  readonly live: boolean;
  readonly look: SparkLook;
}

function Drawn({
  look,
  ring,
  history,
}: {
  readonly look: SparkLook;
  readonly ring: Parameters<typeof sparkChoice>[0];
  readonly history: Parameters<typeof sparkChoice>[1];
}): ReactNode {
  const choice = sparkChoice(ring, history);
  const height = look.height ?? DEFAULT_HEIGHT;
  return choice.source === 'none' ? (
    <EmptyGraph text={look.empty ?? 'No data yet'} height={height} />
  ) : (
    <Sparkline
      points={choice.points}
      colour={look.colour}
      height={height}
      area
      {...(look.domain === undefined ? {} : { domain: look.domain })}
    />
  );
}

function RingBody({
  device,
  capability,
  live,
  look,
  ring,
}: SeriesInput & { readonly ring: LiveRing }): ReactNode {
  useLiveDemand(device.id, ring.topics, undefined, live);
  useRingBackfill(device.id, historyClassOf(device), ring.backfill);
  const points = useLiveSeries(device.id, ring.series);
  const history = useDeviceSeries(device.id, capability, HISTORY_HOURS, live).data;
  return <Drawn look={look} ring={points} history={history} />;
}

function HistoryBody({ device, capability, live, look }: SeriesInput): ReactNode {
  const history = useDeviceSeries(device.id, capability, HISTORY_HOURS, live).data;
  return <Drawn look={look} ring={NO_RING} history={history} />;
}

export function LiveSpark({ device, capability, ring, ...look }: LiveSparkProps): ReactNode {
  const frame = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(frame);
  const input = { device, capability, live, look };
  return (
    <View ref={frame} onLayout={onLayout} collapsable={false} pointerEvents="none" aria-hidden>
      {live && ring !== undefined ? (
        <RingBody {...input} ring={ring} />
      ) : (
        <HistoryBody {...input} />
      )}
    </View>
  );
}
