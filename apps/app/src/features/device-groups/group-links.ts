import type { AppHref } from '../../components/app-href';
import type { DeviceTarget } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';

export function showAllHref(target: DeviceTarget): AppHref {
  switch (target.kind) {
    case 'group':
      return href.group(target.groupId);
    case 'room':
      return target.families?.length === 1 && target.families[0] === 'light'
        ? href.roomLights(target.roomId)
        : href.room(target.roomId);
    case 'devices':
      return href.devices();
  }
}

export function editHref(target: DeviceTarget): AppHref {
  return target.kind === 'group' ? href.group(target.groupId, { edit: true }) : showAllHref(target);
}
