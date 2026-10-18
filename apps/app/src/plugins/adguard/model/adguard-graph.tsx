import { useMemo, type ReactNode } from 'react';
import { EmptyGraph } from '../../../components/charts';
import { useLiveSeries } from '../../../store/computer-rings';
import type { AdGuardSnapshot } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { MIN_LINE_POINTS } from '../../shared/cell-graph-model';
import { useSourceLive } from '../../shared/use-source-live';
import { WideFigure } from '../../../features/devices';
import { MiniStack } from '../widgets/mini-stack';
import { BLOCKED_RATE, LOOKUPS_RATE, LookupRateTracker } from './adguard-live';
import { blockedPerMinute, liveBars } from './adguard-cell-model';
import type { HourBar } from './chart-model';
import { useState } from 'react';

interface GraphProps {
  readonly device: Device;
  readonly live: boolean;
  readonly height: number;
  readonly bars: readonly HourBar[];
}

function Bars({
  bars,
  height,
}: {
  readonly bars: readonly HourBar[];
  readonly height: number;
}): ReactNode {
  return bars.some((bar) => bar.total > 0) ? (
    <MiniStack bars={bars} height={height} />
  ) : (
    <EmptyGraph text="No data yet" height={height} />
  );
}

function LiveBars({ device, height, bars }: GraphProps): ReactNode {
  const lookups = useLiveSeries(device.id, LOOKUPS_RATE);
  const blocked = useLiveSeries(device.id, BLOCKED_RATE);
  const ring = useMemo(() => liveBars(lookups, blocked), [lookups, blocked]);
  return <Bars bars={lookups.length >= MIN_LINE_POINTS ? ring : bars} height={height} />;
}

export function AdGuardGraph(props: GraphProps): ReactNode {
  return props.live ? <LiveBars {...props} /> : <Bars bars={props.bars} height={props.height} />;
}

export function AdGuardHold({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: AdGuardSnapshot;
}): ReactNode {
  const [tracker] = useState(() => new LookupRateTracker());
  useSourceLive(device, snapshot, (live) => tracker.readings(live, Date.parse(live.at)));
  return null;
}

export function LiveBlockedFigure({ device }: { readonly device: Device }): ReactNode {
  const perMinute = blockedPerMinute(useLiveSeries(device.id, BLOCKED_RATE));
  return perMinute === null ? null : (
    <WideFigure value={String(Math.round(perMinute))} unit="/ min" caption="blocked now" />
  );
}
