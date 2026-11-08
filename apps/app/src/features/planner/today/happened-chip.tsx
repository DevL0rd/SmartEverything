import type { PlannerHappened } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { clock } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { deviceIcon } from '../../device-visuals';

export interface MarkChipProps {
  readonly icon: IconName;
  readonly label: string;
  readonly dashed: boolean;
  readonly iconTone?: Tone;
  readonly time?: string;
  readonly spoken?: string;
}

export function MarkChip({
  icon,
  label,
  dashed,
  iconTone = 'variant',
  time,
  spoken,
}: MarkChipProps): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken ?? (time === undefined ? label : `${time} ${label}`)}
      className={cn(
        'min-h-9 flex-row items-center gap-2 self-start rounded-full px-4 py-1',
        dashed ? 'border border-dashed border-outline' : 'bg-surface-2',
      )}
    >
      <Icon name={icon} size={16} tone={iconTone} />
      {time === undefined ? null : (
        <Text variant="label" tone="variant" className="tabular-nums">
          {time}
        </Text>
      )}
      <Text variant="label" tone="variant" className="shrink">
        {label}
      </Text>
    </View>
  );
}

export function HappenedChip({
  happened,
  timeZone,
}: {
  readonly happened: PlannerHappened;
  readonly timeZone: string;
}): ReactNode {
  const device = useRow('devices', happened.deviceId);
  const time = clock(happened.at, timeZone);
  return (
    <MarkChip
      icon={device === null ? 'activity' : deviceIcon(device)}
      label={happened.summary}
      time={time}
      spoken={`${time} ${happened.summary}, happened without a planned item`}
      dashed
    />
  );
}
