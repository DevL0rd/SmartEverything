import type { Href } from 'expo-router';
import type { DeviceTarget } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';

export function showAllHref(target: DeviceTarget): Href {
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

export function editHref(target: DeviceTarget): Href {
  return target.kind === 'group' ? href.group(target.groupId, { edit: true }) : showAllHref(target);
}
