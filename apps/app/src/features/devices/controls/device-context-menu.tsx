import type { ReactNode } from 'react';
import { Menu, useMenuTrigger, type ContextMenu, type MenuOptions } from '../../../components/menu';
import type { Rect } from '../../../components/anchor';
import type { Device } from '../../../store/state';
import { useDeviceMenu } from './device-menu';

const NO_OPTIONS: MenuOptions = {};

function DeviceMenuHost({
  device,
  quickControls,
  label,
  anchor,
  onClose,
}: {
  readonly device: Device;
  readonly quickControls: boolean;
  readonly label: string;
  readonly anchor: Rect;
  readonly onClose: () => void;
}): ReactNode {
  const items = useDeviceMenu(device, { quickControls });
  return (
    <Menu items={items} options={NO_OPTIONS} anchor={anchor} label={label} onClose={onClose} />
  );
}

export function useDeviceContextMenu(
  device: Device,
  options: { readonly quickControls: boolean; readonly label: string },
): ContextMenu {
  const trigger = useMenuTrigger();
  return {
    onLongPress: trigger.onLongPress,
    onContextMenu: trigger.onContextMenu,
    host:
      trigger.anchor === null ? null : (
        <DeviceMenuHost
          device={device}
          quickControls={options.quickControls}
          label={options.label}
          anchor={trigger.anchor}
          onClose={trigger.close}
        />
      ),
  };
}
