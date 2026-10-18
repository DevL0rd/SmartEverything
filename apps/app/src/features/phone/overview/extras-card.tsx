import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import type { Device } from '../../../store/state';
import { usePhoneFace } from '../card/use-phone-face';
import { usePhoneSection } from '../data/phone-detail';

const BLUETOOTH_ICON = {
  watch: 'watch',
  headset: 'audioLines',
  speaker: 'speaker',
  car: 'car',
  computer: 'monitor',
  other: 'bluetooth',
} as const satisfies Readonly<Record<string, IconName>>;
const LOW_BATTERY = 25;

export function ConnectionsCard({ device }: { readonly device: Device }): ReactNode {
  const connections = usePhoneSection(device.id, 'connections')?.bluetooth;
  const { access } = usePhoneFace(device);
  if (connections === undefined || connections.length === 0 || !access.view.own) return null;
  return (
    <Card title="Connections" icon="bluetooth">
      {connections.map((entry) => (
        <View
          key={`${entry.kind}-${entry.name ?? ''}`}
          className="min-h-9 flex-row items-center gap-2.5"
        >
          <Icon name={BLUETOOTH_ICON[entry.kind]} size={20} tone="variant" />
          <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
            {entry.name ?? 'Unnamed device'}
          </Text>
          {entry.batteryPercent === null ? null : (
            <View className="w-12">
              <ProgressBar
                progress={entry.batteryPercent / 100}
                colour={entry.batteryPercent < LOW_BATTERY ? 'warning' : 'positive'}
                label={`${entry.name ?? 'Device'} battery ${String(entry.batteryPercent)} percent`}
              />
            </View>
          )}
        </View>
      ))}
    </Card>
  );
}

export function TodayCard({ device }: { readonly device: Device }): ReactNode {
  const alarm = usePhoneSection(device.id, 'alarm');
  const { access } = usePhoneFace(device);
  if (!access.view.own) return null;
  const next = alarm?.nextAt ?? null;
  const subtitle = next === null ? null : (alarm?.appLabel ?? null);
  return (
    <Card title="Today" icon="alarmClock" padding="none">
      <ListRow
        title="Next alarm"
        icon="alarmClock"
        value={next === null ? 'None' : clock(next)}
        {...(subtitle === null ? {} : { subtitle })}
      />
      <ListRow
        title="Listening"
        icon="mic"
        chevron
        href={href.settings.page('assistant/listening')}
      />
    </Card>
  );
}
