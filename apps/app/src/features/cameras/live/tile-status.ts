import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import type { Status } from '../../../components/status-chip';
import type { CameraEntry } from '../logic/cameras';
import { blockingStateOf, type CameraCondition } from '../player/player-state';

export function cameraStatusOf(
  condition: CameraCondition,
): { readonly status: Status; readonly label?: string } | null {
  const blocked = blockingStateOf(condition);
  if (blocked?.kind === 'offline') {
    return { status: 'offline' };
  }
  if (blocked?.kind === 'privacy') {
    return { status: 'privacy' };
  }
  if (blocked?.kind === 'blockedByFirewall') {
    return { status: 'blocked' };
  }
  return condition.reach === 'needs_rule'
    ? { status: 'attention', label: 'Firewall rule needed' }
    : null;
}

export function useCardMenu(entry: CameraEntry): readonly MenuItem[] {
  const router = useRouter();
  return [
    {
      label: 'Open',
      icon: 'cameras',
      onPress: (): void => {
        router.navigate(href.camera(entry.device.id));
      },
    },
    {
      label: 'Camera settings',
      icon: 'settings',
      onPress: (): void => {
        router.navigate(href.settings.camera(entry.device.id));
      },
    },
  ];
}
