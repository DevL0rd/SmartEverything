import { memo, type ReactNode } from 'react';
import { presentValue, type PresentedCapability } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Sparkline } from '../../../components/charts';
import { StatTile } from '../../../components/stat-tile';
import { useDeviceSeries } from '../../../queries/history';
import type { Device } from '../../../store/state';
import type { JsonValue } from '@smarteverything/domain';
import { splitUnit } from './device-hero';

const TREND_HOURS = 24;
const TREND_HEIGHT = 24;
const MIN_POINTS = 2;

interface TileProps {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly value: JsonValue | undefined;
}

function shownOf({ presented, value }: TileProps): ReturnType<typeof splitUnit> | null {
  return value === undefined ? null : splitUnit(presentValue(presented, value), presented.unit);
}

export const PlainTile = memo(function PlainTile(props: TileProps): ReactNode {
  const shown = shownOf(props);
  return shown === null ? null : (
    <StatTile compact label={props.presented.label} {...shown} stale={!props.device.online} />
  );
});

export const TrendTile = memo(function TrendTile(props: TileProps): ReactNode {
  const { device, presented } = props;
  const series = useDeviceSeries(device.id, presented.key, TREND_HOURS);
  const shown = shownOf(props);
  if (shown === null) {
    return null;
  }
  const points = series.data ?? [];
  return (
    <StatTile
      compact
      label={presented.label}
      {...shown}
      stale={!device.online}
      href={href.deviceSection(device.id, 'history')}
      {...(points.length < MIN_POINTS
        ? {}
        : {
            trend: <Sparkline points={points} colour="primary" height={TREND_HEIGHT} />,
          })}
    />
  );
});
