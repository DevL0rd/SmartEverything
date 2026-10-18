import { useMemo } from 'react';
import type { MenuItem } from '../../../components/menu';
import { confirm } from '../../../components/confirm-store';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { background } from '@smarteverything/logging';
import { useComputerAi } from '../data/computer-ai';
import { isHub, offersAction, useComputerCommand } from '../data/computer-device';
import { useRevokeComputer } from '../data/computer-overview';
import { menuEntries, type MenuEntry } from '../model/computer-menu';

export function useComputerMenu(device: Device, onPair: () => void): readonly MenuItem[] {
  const owner = useIsOwner();
  const run = useComputerCommand(device);
  const revoke = useRevokeComputer(device.id, device.label);
  const local = useComputerAi(device.id).data?.local;
  const { label, online } = device;
  const hub = isHub(device);
  const entries = useMemo(
    () =>
      menuEntries({
        name: label,
        offline: !online,
        offers: (capability) => offersAction(device, capability),
        owner,
        canRevoke: local === false,
        hub,
      }),
    [device, label, online, owner, local, hub],
  );
  const perform = (entry: MenuEntry): void => {
    if (entry.key === 'pair') onPair();
    else if (entry.key === 'revoke') revoke.mutate();
    else run(entry.key, null);
  };
  return entries.map((entry): MenuItem => ({
    label: entry.label,
    icon: entry.icon,
    ...(entry.destructive ? { destructive: true } : {}),
    onPress: (): void => {
      const { confirm: request } = entry;
      if (request === null) {
        perform(entry);
        return;
      }
      background(
        confirm({
          title: request.title,
          body: request.body,
          confirmLabel: request.confirmLabel,
          tone: request.destructive ? 'destructive' : 'default',
        }).then((accepted) => {
          if (accepted) perform(entry);
        }),
        'computer_menu.confirm_failed',
      );
    },
  }));
}
