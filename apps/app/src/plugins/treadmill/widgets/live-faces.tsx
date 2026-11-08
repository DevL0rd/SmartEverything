import type { TreadmillStateView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Sparkline } from '../../../components/charts';
import type { FigureSize } from '../../../components/figure';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { Device } from '../../../store/state';
import { BeltArt } from '../components/belt-visual';
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
import { bodyHeightOf, gaugePxOf, liveFaceOf, stripShowsTrend } from '../model/widget-model';
import { count } from '../../../format/number';
import { InclineBlock, InclineLine } from './incline-readout';

interface FaceProps {
  readonly device: Device;
  readonly view: TreadmillStateView;
}

const TREND_TITLE = 20;
const TREND_MIN = 16;

function SpeedBlock({ device, view, size }: FaceProps & { readonly size: FigureSize }): ReactNode {
  const speed = useLiveSelect(device.id, view.frame, (frame) => frame.belt.speedKmh);
  const zone = movingZone(speed);
  return (
    <View className="min-w-0 gap-1">
      <LiveFigure value={speedText(speed)} unit="km/h" size={size} widest="15.0" />
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

function FillTrend(props: FaceProps): ReactNode {
  const [space, setSpace] = useState(0);
  return (
    <View
      className="min-h-0 flex-1 justify-end"
      onLayout={(event) => {
        setSpace(event.nativeEvent.layout.height);
      }}
    >
      <Trend {...props} height={Math.max(TREND_MIN, space - TREND_TITLE)} />
    </View>
  );
}

function StateRow({ device, view }: FaceProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <StateBadge deviceId={device.id} view={view} />
    </View>
  );
}

function Strip({ device, view }: FaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const body = bodyHeightOf(frame);
  return (
    <View className="flex-1 flex-row gap-3">
      <BeltArt device={device} view={view} />
      <View className="min-w-0 flex-1 flex-row gap-4">
        <View className="min-w-0 shrink gap-1">
          <SpeedBlock device={device} view={view} size="m" />
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <StateBadge deviceId={device.id} view={view} />
            <InclineLine deviceId={device.id} view={view} />
          </View>
        </View>
        {stripShowsTrend(frame.width) ? (
          <Trend device={device} view={view} height={Math.max(TREND_MIN, body - TREND_TITLE)} />
        ) : null}
      </View>
    </View>
  );
}

function Stack({ device, view }: FaceProps): ReactNode {
  return (
    <View className="flex-1 flex-row gap-4">
      <BeltArt device={device} view={view} />
      <View className="min-w-0 flex-1 gap-3">
        <View className="min-w-0 gap-1">
          <SpeedBlock device={device} view={view} size="l" />
          <StateRow device={device} view={view} />
        </View>
        <InclineBlock deviceId={device.id} view={view} />
        <FillTrend device={device} view={view} />
        <Counters device={device} view={view} />
      </View>
    </View>
  );
}

function Row({ device, view }: FaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const body = bodyHeightOf(frame);
  return (
    <View className="flex-1 flex-row gap-4">
      <BeltArt device={device} view={view} />
      <View className="min-w-0 flex-1 flex-row gap-4">
        <View className="min-w-0 gap-1">
          <SpeedBlock device={device} view={view} size="m" />
          <StateRow device={device} view={view} />
        </View>
        <View className="w-28 shrink-0">
          <InclineBlock deviceId={device.id} view={view} />
        </View>
        <Trend device={device} view={view} height={Math.max(TREND_MIN, body - TREND_TITLE)} />
        <Counters device={device} view={view} />
      </View>
    </View>
  );
}

function Panel({ device, view }: FaceProps): ReactNode {
  const { frame } = useWidgetFace();
  return (
    <View className="flex-1 flex-row gap-4">
      <BeltArt device={device} view={view} />
      <View className="min-w-0 flex-1 flex-row gap-4">
        <SpeedGauge deviceId={device.id} view={view} size={gaugePxOf(bodyHeightOf(frame))} />
        <View className="min-w-0 flex-1 gap-3">
          <StateRow device={device} view={view} />
          <FillTrend device={device} view={view} />
          <InclineBlock deviceId={device.id} view={view} />
          <Counters device={device} view={view} />
        </View>
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
