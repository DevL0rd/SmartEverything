import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ScheduleRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useSecondOf } from '../../../store/clock';
import { cancelScheduled } from './actions';
import { powerVerbOf } from './steps';
import { useDeviceSchedule } from './use-scheduled';
import { countdown, secondsLeft, titleOf } from './view';

function chipText(row: ScheduleRow, deviceId: string, now: number): string {
  const verb = powerVerbOf(row.steps, deviceId) ?? 'Runs';
  if (row.state === 'running') {
    return `${verb} now`;
  }
  const left = secondsLeft(row, now);
  return left === null ? verb : `${verb} in ${countdown(left)}`;
}

function Chip({
  row,
  deviceId,
  compact,
}: {
  readonly row: ScheduleRow;
  readonly deviceId: string;
  readonly compact: boolean;
}): ReactNode {
  const text = useSecondOf((now) => chipText(row, deviceId, now));
  return (
    <View className="flex-row items-center self-start rounded-full bg-primary-container">
      <Interactive
        href={href.scheduledItem(row.id)}
        label={`${text}. ${titleOf(row)}`}
        className="min-h-8 flex-row items-center gap-1.5 rounded-full px-3"
        layerClassName="rounded-full"
      >
        <Icon name="timer" size={16} tone="primary" />
        <Text variant="label" tone="primary" numberOfLines={1}>
          {text}
        </Text>
      </Interactive>
      {compact ? null : (
        <IconButton
          icon="close"
          label={`Cancel: ${titleOf(row)}`}
          onPress={() => {
            cancelScheduled(row);
          }}
        />
      )}
    </View>
  );
}

export function DeviceScheduleChip({
  deviceId,
  compact = false,
  pinnedClassName,
}: {
  readonly deviceId: string;
  readonly compact?: boolean;
  readonly pinnedClassName?: string;
}): ReactNode {
  const row = useDeviceSchedule(deviceId);
  if (row === null) {
    return null;
  }
  const chip = <Chip row={row} deviceId={deviceId} compact={compact} />;
  return pinnedClassName === undefined ? (
    chip
  ) : (
    <View className={pinnedClassName} pointerEvents="box-none">
      {chip}
    </View>
  );
}

export function useScheduleBelow(deviceId: string): { readonly below?: ReactNode } {
  return useDeviceSchedule(deviceId) === null
    ? {}
    : { below: <DeviceScheduleChip deviceId={deviceId} /> };
}
