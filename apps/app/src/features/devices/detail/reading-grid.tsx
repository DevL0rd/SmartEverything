import type { ReactNode } from 'react';
import { presentValue, type PresentedCapability } from '@smarteverything/domain';
import { Grid } from '../../../components/grid';
import { Section } from '../../../components/section';
import { StatTile } from '../../../components/stat-tile';
import type { Device, DeviceValues } from '../../../store/state';
import { useDeviceValues } from '../../../store/selectors';
import { valueOf, useDeviceModel } from '../model/device-model';
import { heroReadingOf, readingsOf } from '../model/readings';
import { splitUnit } from './device-hero';

function Tile({
  presented,
  values,
  stale,
}: {
  readonly presented: PresentedCapability;
  readonly values: DeviceValues;
  readonly stale: boolean;
}): ReactNode {
  const value = valueOf(values, presented);
  if (value === undefined) {
    return null;
  }
  const shown = splitUnit(presentValue(presented, value), presented.unit);
  return <StatTile label={presented.label} {...shown} stale={stale} />;
}

export function useReadings(device: Device): readonly PresentedCapability[] {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  return readingsOf(model, values, heroReadingOf(model, values));
}

export function ReadingGrid({ device }: { readonly device: Device }): ReactNode {
  const values = useDeviceValues(device.id);
  const readings = useReadings(device);
  if (readings.length === 0) {
    return null;
  }
  return (
    <Section title="Readings">
      <Grid minItemWidth={140} maxColumns={4}>
        {readings.map((presented) => (
          <Tile key={presented.key} presented={presented} values={values} stale={!device.online} />
        ))}
      </Grid>
    </Section>
  );
}
