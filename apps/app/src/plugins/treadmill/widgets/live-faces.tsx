import type { TreadmillStateView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Sparkline } from '../../../components/charts';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { Device } from '../../../store/state';
import { BeltVisual } from '../components/belt-visual';
import { SpeedGauge } from '../components/speed-gauge';
import { StateBadge } from '../components/state-badge';
import { useLivePoints, useLiveSelect } from '../data/treadmill-data';
import { seriesOf } from '../model/speed-history';
import {
  clockText,
  distanceFigure,
  movingZone,
  speedText,
  ZONE_LABEL,
} from '../model/treadmill-model';
import { speedSummary } from '../model/treadmill-summary';
import {
  bodyHeightOf,
  gaugePxOf,
  liveFaceOf,
  stripShowsTrend,
  visualPxOf,
} from '../model/widget-model';
import { count } from '../../../format/number';
import { InclineBlock, InclineLine } from './incline-readout';

interface FaceProps {
  readonly device: Device;
  readonly view: TreadmillStateView;
}

function SpeedBlock({ device, view }: FaceProps): ReactNode {
  const speed = useLiveSelect(device.id, view.frame, (frame) => frame.belt.speedKmh);
  const zone = movingZone(speed);
  return (
    <View className="min-w-0 gap-1">
      <LiveFigure value={speedText(speed)} unit="km/h" size="l" widest="15.0" />
      {zone === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {ZONE_LABEL[zone]}
        </Text>
      )}
    </View>
  );
}

function Counters({ device, view }: FaceProps): ReactNode {
  const belt = useLiveSelect(device.id, view.frame, (frame) => frame.belt);
  const distance = distanceFigure(belt.distanceM);
  const rows: readonly (readonly [string, string])[] = [
    ['Time', clockText(belt.timeS)],
    ['Distance', `${distance.value} ${distance.unit}`],
    ...(belt.steps === null ? [] : [['Steps', count(belt.steps)] as const]),
  ];
  return (
    <View className="gap-1">
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row items-baseline justify-between gap-3">
          <Text variant="caption" tone="variant">
            {label}
          </Text>
          <Text variant="body-strong" className="tabular">
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Trend({ device, view, height }: FaceProps & { readonly height: number }): ReactNode {
  const points = seriesOf(useLivePoints(device.id, view.recentSpeed), (point) => point.speed);
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink-0">
        Speed, last 5 minutes
      </Text>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={speedSummary(points, 5)}
        className="justify-end"
      >
        {points.length < 2 ? (
          <Text variant="caption" tone="faint" numberOfLines={2}>
            The speed shows here once the belt moves.
          </Text>
        ) : (
          <Sparkline points={points} colour="primary" height={height} area />
        )}
      </View>
    </View>
  );
}

function Strip({ device, view }: FaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const body = bodyHeightOf(frame);
  const px = visualPxOf('strip', body);
  return (
    <View className="flex-1 flex-row items-center gap-3">
      <BeltVisual device={device} view={view} size="card" px={px} />
      <View className="min-w-0 shrink gap-1">
        <SpeedBlock device={device} view={view} />
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <StateBadge deviceId={device.id} view={view} />
          <InclineLine deviceId={device.id} view={view} />
        </View>
      </View>
      {stripShowsTrend(frame.width) ? (
        <Trend device={device} view={view} height={Math.max(24, body - 32)} />
      ) : null}
    </View>
  );
}

const TREND_TITLE = 22;
const TREND_MIN = 16;

function Stack({ device, view }: FaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const body = bodyHeightOf(frame);
  const [space, setSpace] = useState(0);
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row items-center gap-3">
        <BeltVisual device={device} view={view} size="card" px={visualPxOf('stack', body)} />
        <View className="min-w-0 flex-1 gap-1">
          <SpeedBlock device={device} view={view} />
          <View className="flex-row items-center gap-2">
            <StateBadge deviceId={device.id} view={view} />
          </View>
        </View>
      </View>
      <InclineBlock deviceId={device.id} view={view} />
      <View
        className="min-h-0 flex-1 justify-end"
        onLayout={(event) => {
          setSpace(event.nativeEvent.layout.height);
        }}
      >
        <Trend device={device} view={view} height={Math.max(TREND_MIN, space - TREND_TITLE)} />
      </View>
      <Counters device={device} view={view} />
    </View>
  );
}

function Row({ device, view }: FaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const body = bodyHeightOf(frame);
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <BeltVisual device={device} view={view} size="card" px={visualPxOf('row', body)} />
      <View className="min-w-0 gap-1">
        <SpeedBlock device={device} view={view} />
        <StateBadge deviceId={device.id} view={view} />
      </View>
      <View className="w-28 shrink-0">
        <InclineBlock deviceId={device.id} view={view} />
      </View>
      <Trend device={device} view={view} height={Math.max(24, body - 48)} />
      <Counters device={device} view={view} />
    </View>
  );
}

function Panel({ device, view }: FaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const body = bodyHeightOf(frame);
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <View className="items-center gap-2">
        <BeltVisual device={device} view={view} size="card" px={visualPxOf('panel', body)} />
        <StateBadge deviceId={device.id} view={view} />
      </View>
      <SpeedGauge deviceId={device.id} view={view} size={gaugePxOf(body)} />
      <View className="min-w-0 flex-1 gap-3">
        <Trend device={device} view={view} height={Math.max(24, body - 150)} />
        <InclineBlock deviceId={device.id} view={view} />
        <Counters device={device} view={view} />
      </View>
    </View>
  );
}

export function LiveFace({ device, view }: FaceProps): ReactNode {
  const { cls } = useWidgetFace();
  const face = liveFaceOf(cls);
  return (
    <View className="flex-1" pointerEvents="box-none">
      {face === 'strip' ? <Strip device={device} view={view} /> : null}
      {face === 'stack' ? <Stack device={device} view={view} /> : null}
      {face === 'row' ? <Row device={device} view={view} /> : null}
      {face === 'panel' ? <Panel device={device} view={view} /> : null}
    </View>
  );
}
