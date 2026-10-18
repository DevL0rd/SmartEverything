import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import type { Device } from '../../../store/state';
import { Guard } from '../controls/guard';
import { useDeviceControl } from '../controls/use-device-control';

export function ModeMenuButton({
  device,
  presented,
  reason,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly reason: string | null;
}): ReactNode {
  const control = useDeviceControl(device, presented);
  const current = typeof control.value === 'string' ? control.value : null;
  const items: readonly MenuItem[] = presented.options.map((option) => ({
    label: option.label,
    ...(option.value === current ? { icon: 'check' as const } : {}),
    onPress: (): void => {
      background(control.set(option.value), 'control.set_failed');
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, presented.label);
  const shown = presented.options.find((option) => option.value === current)?.label;
  return (
    <View ref={ref} collapsable={false}>
      <Guard reason={reason}>
        <Button
          label={shown ?? presented.label}
          hint={presented.label}
          variant="tonal"
          icon="chevronDown"
          disabled={reason !== null}
          onPress={open}
        />
      </Guard>
      {menu}
    </View>
  );
}
