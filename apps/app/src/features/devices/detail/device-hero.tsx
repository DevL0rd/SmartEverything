import type { ReactNode } from 'react';
import { View } from 'react-native';
import { presentValue, type PresentedCapability } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { useDeviceValues } from '../../../store/selectors';
import type { Device, DeviceValues } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { dialReading } from '../controls/dial-block';
import { usePrimaryControls } from '../controls/primary-controls';
import { powerStateOf, useDeviceModel, valueOf } from '../model/device-model';
import { airOf, heroReadingOf } from '../model/readings';
import { stateLine } from '../model/state-line';

export function splitUnit(
  text: string,
  unit: string | null,
): { readonly value: string; readonly unit?: string } {
  if (unit !== null && text.endsWith(unit)) {
    return { value: text.slice(0, -unit.length).trim(), unit };
  }
  return { value: text };
}

function Reading({
  hero,
  values,
  stale,
}: {
  readonly hero: PresentedCapability;
  readonly values: DeviceValues;
  readonly stale: boolean;
}): ReactNode {
  const value = valueOf(values, hero);
  if (value === undefined) {
    return null;
  }
  const air = airOf(hero, values);
  const shown = splitUnit(presentValue(hero, value), hero.unit);
  return (
    <View className="items-center gap-1">
      <Text variant="footnote" tone="variant">
        {hero.label}
      </Text>
      <Figure {...shown} size="l" stale={stale} />
      {air === null ? null : (
        <Text variant="callout" tone={stale ? 'faint' : 'default'}>
          {air.label}
        </Text>
      )}
    </View>
  );
}

const NO_EXCLUSIONS = new Set<never>();

export function DeviceHero({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const dialled = usePrimaryControls(device, NO_EXCLUSIONS).flatMap((presented) => {
    const role = dialReading(presented);
    return role === null ? [] : [role];
  });
  const reading = heroReadingOf(model, values);
  const hero = dialled.some((role) => role === reading?.role) ? null : reading;
  const power = powerStateOf(model, values);
  const stale = !device.online;
  return (
    <Card>
      <View className="items-center gap-4 py-2">
        <DeviceVisual device={device} size="hero" />
        {hero === null ? null : <Reading hero={hero} values={values} stale={stale} />}
        <View className="flex-row justify-center">
          <Badge
            label={stateLine(model, values, false)}
            tone={power === 'on' ? 'primary' : 'neutral'}
          />
        </View>
      </View>
    </Card>
  );
}
