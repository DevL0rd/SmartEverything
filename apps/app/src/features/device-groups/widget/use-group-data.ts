import type { Href } from 'expo-router';
import { roomLightsName, type DeviceTarget } from '@smarteverything/domain';
import { useLoaded, useRoom } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { showAllHref } from '../group-links';
import { orderMembers } from '../group-summary';
import { memberNameOf } from '../model/member-name';
import { useMaster, type Master } from '../use-master';
import { allLights, useTargetMembers } from '../use-target-members';
import { useTargetView, type TargetView } from '../use-target-state';

export interface GroupData {
  readonly target: DeviceTarget;
  readonly name: string;
  readonly href: Href;
  readonly members: readonly Device[];
  readonly lights: boolean;
  readonly view: TargetView;
  readonly master: Master;
  readonly lost: number;
  readonly nameOf: (deviceId: string) => string;
}

export type GroupLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'removed' }
  | { readonly status: 'ready'; readonly data: GroupData };

const NO_MEMBERS: readonly Device[] = [];

export function useGroupLoad(target: DeviceTarget, title: string | undefined): GroupLoad {
  const loaded = useLoaded();
  const found = useTargetMembers(target);
  const view = useTargetView(target);
  const room = useRoom(target.kind === 'room' ? target.roomId : null);
  const members = found.status === 'ready' ? found.members : NO_MEMBERS;
  const master = useMaster(target, members, view.state, view.powers);
  if (!loaded) return { status: 'loading' };
  if (found.status === 'removed') return { status: 'removed' };
  const nameOf = (deviceId: string): string => memberNameOf(members, deviceId);
  const name = title ?? found.group?.name ?? (room === null ? 'Lights' : roomLightsName(room));
  return {
    status: 'ready',
    data: {
      target,
      name,
      href: showAllHref(target),
      members: orderMembers(members),
      lights: allLights(members),
      view,
      master,
      nameOf,
      lost: found.group === null ? 0 : found.group.device_ids.length - members.length,
    },
  };
}
