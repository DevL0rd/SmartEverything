import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import type { Device } from '../../../store/state';
import { usePhoneFace } from '../card/use-phone-face';
import { usePhoneLiveHeld } from '../data/phone-live';
import { usePhoneSection } from '../data/phone-detail';
import { chargerText, rateText } from '../model/battery-view';
import { BatteryArc } from '../overview/battery-arc';

function Line({
  icon,
  text,
}: {
  readonly icon: 'plug' | 'clock' | 'power';
  readonly text: string;
}): ReactNode {
  return (
    <View className="min-h-8 flex-row items-center gap-2">
      <Icon name={icon} size={20} tone="variant" />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {text}
      </Text>
    </View>
  );
}

export function BatteryHero({ device }: { readonly device: Device }): ReactNode {
  const { readings, word, online } = usePhoneFace(device);
  const power = usePhoneSection(device.id, 'power');
  const live = usePhoneLiveHeld(device.id);
  const rate = live && online ? rateText(power, readings.charging) : null;
  return (
    <Card>
      <View className="flex-row items-center gap-5">
        <BatteryArc level={readings.battery} tone={word.tone} stale={!online} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="title-2">{readings.charging ? 'Charging' : 'On battery'}</Text>
          {power === undefined || power.charger === 'none' ? null : (
            <Line icon="plug" text={chargerText(power.charger)} />
          )}
          {readings.chargeFullAt === null || !readings.charging ? null : (
            <Line icon="clock" text={`Full at ~${clock(readings.chargeFullAt)}`} />
          )}
          {rate === null ? null : <Line icon="power" text={rate} />}
        </View>
      </View>
    </Card>
  );
}
