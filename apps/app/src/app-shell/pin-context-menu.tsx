import type { ReactNode } from 'react';
import type { NavPinTarget } from '@smarteverything/domain';
import type { Rect } from '../components/anchor';
import { Menu, useMenuTrigger, type ContextMenu, type MenuOptions } from '../components/menu';
import { usePinMenuItems } from './pin-menu';

const NO_OPTIONS: MenuOptions = {};

function PinMenuHost({
  target,
  label,
  anchor,
  onClose,
}: {
  readonly target: NavPinTarget;
  readonly label: string;
  readonly anchor: Rect;
  readonly onClose: () => void;
}): ReactNode {
  const items = usePinMenuItems(target);
  return (
    <Menu items={items} options={NO_OPTIONS} anchor={anchor} label={label} onClose={onClose} />
  );
}

export function usePinContextMenu(target: NavPinTarget, label: string): ContextMenu {
  const trigger = useMenuTrigger();
  return {
    onLongPress: trigger.onLongPress,
    onContextMenu: trigger.onContextMenu,
    host:
      trigger.anchor === null ? null : (
        <PinMenuHost
          target={target}
          label={label}
          anchor={trigger.anchor}
          onClose={trigger.close}
        />
      ),
  };
}
