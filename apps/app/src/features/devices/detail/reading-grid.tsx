import type { ReactNode } from 'react';
import type { PresentedCapability } from '@smarteverything/domain';
import { Grid } from '../../../components/grid';
import { Section } from '../../../components/section';
import type { Device, DeviceValues } from '../../../store/state';
import { useDeviceValues } from '../../../store/selectors';
import { useDeviceModel, valueOf, type DeviceModel } from '../model/device-model';
import { heroReadingOf, readingsOf } from '../model/readings';
import { useStateLine } from '../model/state-line';
import { shownReadings } from './readings-filter';
import { PlainTile, TrendTile } from './reading-tile';

const TREND_TILES = 4;

export function hasReadings(model: DeviceModel, values: DeviceValues): boolean {
  return readingsOf(model, values, heroReadingOf(model, values)).length > 0;
}

function trendable(presented: PresentedCapability, position: number): boolean {
  return position < TREND_TILES && presented.capability.value.kind === 'number';
}

export function ReadingGrid({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const line = useStateLine(model, false);
  const readings = shownReadings(model, values, line);
  if (readings.length === 0) {
    return null;
  }
  return (
    <Section title="Readings">
      <Grid minItemWidth={156} maxColumns={4}>
        {readings.map((presented, position) =>
          trendable(presented, position) ? (
            <TrendTile
              key={presented.key}
              device={device}
              presented={presented}
              value={valueOf(values, presented)}
            />
          ) : (
            <PlainTile
              key={presented.key}
              device={device}
              presented={presented}
              value={valueOf(values, presented)}
            />
          ),
        )}
      </Grid>
    </Section>
  );
}
