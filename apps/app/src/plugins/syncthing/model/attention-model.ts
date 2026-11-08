import type { SyncAttention } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import { syncSectionHref } from './links';

export function attentionTarget(item: SyncAttention, deviceId: string): AppHref | null {
  if (item.folderId !== null) {
    return syncSectionHref(deviceId, 'folders', { folder: item.folderId });
  }
  return item.deviceId === null
    ? null
    : syncSectionHref(deviceId, 'devices', { device: item.deviceId });
}
