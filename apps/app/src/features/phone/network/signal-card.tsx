import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { TimeSeriesChart } from '../../../components/charts';
import { Text } from '../../../components/text';
import { MINUTE_MS } from '../../../format/time';
import {
  activeBars,
  pushTrail,
  signalWord,
  type NetworkSection,
  type TrailPoint,
} from './network-model';
import { SignalMeter } from './signal-meter';

const SPAN_MS = 2 * MINUTE_MS;
const MIN_POINTS = 2;
const DBM_DOMAIN = [-90, -30] as const;
const BARS_DOMAIN = [0, 4] as const;
const CHART_HEIGHT = 120;
const EMPTY: readonly TrailPoint[] = [];

function pointOf(network: NetworkSection): TrailPoint {
  const value =
    network.kind === 'wifi' && network.wifi !== null ? network.wifi.rssiDbm : activeBars(network);
  return { t: Date.parse(network.at), v: value };
}

function useTrail(network: NetworkSection, live: boolean): readonly TrailPoint[] {
  const [trail, setTrail] = useState(EMPTY);
  if (!live) {
    if (trail.length > 0) setTrail(EMPTY);
    return EMPTY;
  }
  const next = pushTrail(trail, pointOf(network), SPAN_MS);
  if (next !== trail) setTrail(next);
  return next;
}

function Trail({
  trail,
  dbm,
}: {
  readonly trail: readonly TrailPoint[];
  readonly dbm: boolean;
}): ReactNode {
  const newest = trail.at(-1);
  if (newest === undefined || trail.length < MIN_POINTS) {
    return (
      <Text variant="callout" tone="variant">
        The chart draws as readings arrive
      </Text>
    );
  }
  return (
    <TimeSeriesChart
      series={[{ points: trail, colour: 'viz-1', label: dbm ? 'Wi-Fi signal' : 'Signal bars' }]}
      window={{ spanMs: SPAN_MS, now: newest.t }}
      yDomain={dbm ? DBM_DOMAIN : BARS_DOMAIN}
      label={dbm ? 'Wi-Fi signal, last 2 minutes' : 'Signal bars, last 2 minutes'}
      unit={dbm ? 'dBm' : 'bars'}
      height={CHART_HEIGHT}
    />
  );
}

export function SignalCard({
  network,
  live,
  offline,
}: {
  readonly network: NetworkSection;
  readonly live: boolean;
  readonly offline: boolean;
}): ReactNode {
  const trail = useTrail(network, live && !offline);
  const bars = offline ? 0 : activeBars(network);
  return (
    <Card title="Signal" icon="signal">
      {live && !offline ? (
        <Trail trail={trail} dbm={network.kind === 'wifi' && network.wifi !== null} />
      ) : (
        <View className="flex-row items-center gap-3">
          <SignalMeter bars={bars} name="Current" />
          <Text variant="callout" tone="variant" className="min-w-0 flex-1">
            {offline
              ? 'No reading while offline'
              : `${signalWord(bars)} now. The chart draws while you look.`}
          </Text>
        </View>
      )}
    </Card>
  );
}
