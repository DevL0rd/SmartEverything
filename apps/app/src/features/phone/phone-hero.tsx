import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { Card } from '../../components/card';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { useDeviceValues } from '../../store/selectors';
import type { Device } from '../../store/state';
import { DeviceVisual } from '../device-visuals';
import { CONTEXT_TEXT } from './phone-context-text';
import { doingIcon, phoneReadingsOf, type PhoneDoing, type PhoneReadings } from './phone-values';
import { ParkedCard } from './parked-card';
import { useIsThisPhone } from './this-phone-device';

function DoingBadge({ doing }: { readonly doing: PhoneDoing }): ReactNode {
  const now = useMinute();
  return (
    <Badge
      label={`${CONTEXT_TEXT[doing.state]} · ${relative(doing.at, now)}`}
      tone="primary"
      icon={doingIcon(doing)}
    />
  );
}

function BatteryFigure({
  readings,
  stale,
}: {
  readonly readings: PhoneReadings;
  readonly stale: boolean;
}): ReactNode {
  if (readings.battery === null) {
    return null;
  }
  return (
    <View className="items-center gap-1">
      <Text variant="footnote" tone="variant">
        {readings.charging ? 'Charging' : 'Battery'}
      </Text>
      <Figure value={String(readings.battery)} unit="%" size="l" stale={stale} />
    </View>
  );
}

export function PhoneHero({ device }: { readonly device: Device }): ReactNode {
  const readings = phoneReadingsOf(useDeviceValues(device.id));
  const here = useIsThisPhone(device);
  return (
    <View className="gap-section-gap">
      <Card>
        <View className="items-center gap-4 py-2">
          <DeviceVisual device={device} size="hero" />
          <BatteryFigure readings={readings} stale={!device.online} />
          <View className="flex-row flex-wrap justify-center gap-2">
            {readings.doing === null ? null : <DoingBadge doing={readings.doing} />}
            {readings.network === null ? null : <Badge label={readings.network} tone="neutral" />}
          </View>
        </View>
      </Card>
      {here ? <ParkedCard /> : null}
    </View>
  );
}
