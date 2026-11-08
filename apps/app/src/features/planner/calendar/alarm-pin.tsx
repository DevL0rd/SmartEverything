import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { topStyle, yOf, type AlarmPin as Pin } from './time-grid-layout';

export const PILL_HEIGHT = 20;

export function pinText(pin: Pin, compact: boolean): string {
  return compact || pin.label === null ? pin.time : `${pin.time} ${pin.label}`;
}

export function pinLabel(pin: Pin): string {
  return `Alarm ${pin.time}${pin.label === null ? '' : `, ${pin.label}`}, opens Clock`;
}

export function AlarmPin({
  pin,
  hourHeight,
  compact,
}: {
  readonly pin: Pin;
  readonly hourHeight: number;
  readonly compact: boolean;
}): ReactNode {
  const top = yOf(pin.minute, hourHeight);
  return (
    <View pointerEvents="box-none" style={topStyle(top)} className="absolute inset-x-0 h-0">
      <View pointerEvents="none" className="absolute inset-x-0 -top-px h-0.5 bg-primary" />
      <View
        pointerEvents="box-none"
        className={cn('absolute left-0.5 flex-row', top < PILL_HEIGHT ? 'top-1' : 'bottom-0.5')}
      >
        <Interactive
          href={href.clock.alarms()}
          label={pinLabel(pin)}
          className="flex-row items-center gap-1 rounded-full bg-primary-container py-0.5 pl-1.5 pr-2"
        >
          <Icon name="alarmClock" size={16} tone="onPrimaryContainer" />
          <Text variant="caption" tone="onPrimaryContainer" numberOfLines={1} className="tabular">
            {pinText(pin, compact)}
          </Text>
        </Interactive>
      </View>
    </View>
  );
}
