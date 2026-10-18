import { router } from 'expo-router';
import type { DeviceGroupRow, DeviceTarget } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { BoardWidget } from '../../../components/widget-board';
import type { HeaderAction } from '../../../components/page-header';
import type { MenuItem } from '../../../components/menu';
import { confirmRemoval, removeGroup } from '../data/remove-group';
import { notify } from '../../../components/toast-store';
import { targetBoardWidget } from '../group-defaults';
import { powerLabel } from '../widget/group-header';
import type { GroupData } from '../widget/use-group-data';

export type AddToHome = (widget: BoardWidget) => void;

export function powerAction(data: GroupData, noun: 'light' | 'device'): readonly HeaderAction[] {
  const { state } = data.view;
  if (state.power === 'none' || state.members === 0) return [];
  return [
    {
      icon: 'power',
      label: powerLabel(state, data.name, noun),
      primary: state.on > 0,
      onPress: data.master.togglePower,
    },
  ];
}

async function removeAndLeave(group: DeviceGroupRow, uses: readonly string[]): Promise<void> {
  if (!(await confirmRemoval(group, uses))) return;
  try {
    await removeGroup(group);
    router.replace(href.devices());
  } catch (error) {
    notify({ message: 'The device group was not removed', error, tone: 'critical' });
  }
}

function homeItem(target: DeviceTarget, addToHome: AddToHome): MenuItem {
  return {
    label: 'Add to Home',
    icon: 'home',
    onPress: (): void => {
      addToHome(targetBoardWidget(target));
    },
  };
}

export function pageMenu({
  target,
  group,
  uses,
  onEdit,
  addToHome,
}: {
  readonly target: DeviceTarget;
  readonly group: DeviceGroupRow | null;
  readonly uses: readonly string[];
  readonly onEdit: () => void;
  readonly addToHome: AddToHome;
}): readonly MenuItem[] {
  const onHome = homeItem(target, addToHome);
  if (group !== null)
    return [
      { label: 'Edit group', icon: 'pencil', onPress: onEdit },
      onHome,
      {
        label: 'Remove group',
        icon: 'trash',
        destructive: true,
        onPress: (): void => {
          background(removeAndLeave(group, uses), 'group_menu.remove_failed');
        },
      },
    ];
  if (target.kind !== 'room') return [];
  return [
    {
      label: 'Room page',
      icon: 'chevronRight',
      onPress: (): void => {
        router.push(href.room(target.roomId));
      },
    },
    onHome,
    {
      label: 'Choose room for lights',
      icon: 'grid',
      onPress: (): void => {
        router.push({ pathname: '/devices', params: { room: target.roomId } });
      },
    },
  ];
}
