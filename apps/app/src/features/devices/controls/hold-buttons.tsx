import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { PresentedCapability } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { useHoldRepeat } from '../television/use-hold-repeat';
import { Guard } from './guard';
import { background } from '@smarteverything/logging';

const REPEAT_MS = 700;

function HoldButton({
  device,
  presented,
  icon,
  disabled,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly icon: IconName;
  readonly disabled: boolean;
}): ReactNode {
  const control = useControl(device.id, presented.key);
  const turn = (stop: () => void): void => {
    selectionTick();
    background(
      control.set(null).then((sent) => {
        if (!sent) {
          stop();
        }
      }),
      'control.set_failed',
    );
  };
  const handlers = useHoldRepeat(turn, () => REPEAT_MS);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={presented.label}
      accessibilityHint="Hold to keep turning"
      accessibilityState={{ disabled }}
      disabled={disabled}
      {...handlers}
      className={cn(
        'h-control-h flex-1 flex-row items-center justify-center gap-2 rounded-full bg-surface-2 px-4 active:bg-surface-3',
        disabled && 'opacity-40',
      )}
    >
      <Icon name={icon} size={20} />
      <Text variant="label" numberOfLines={1}>
        {presented.label}
      </Text>
    </Pressable>
  );
}

export function HoldButtons({
  device,
  left,
  right,
  reason,
}: {
  readonly device: Device;
  readonly left: PresentedCapability;
  readonly right: PresentedCapability;
  readonly reason: string | null;
}): ReactNode {
  const disabled = reason !== null;
  return (
    <Guard reason={reason}>
      <View className="flex-row gap-2">
        <HoldButton device={device} presented={left} icon="chevronLeft" disabled={disabled} />
        <HoldButton device={device} presented={right} icon="chevronRight" disabled={disabled} />
      </View>
    </Guard>
  );
}
