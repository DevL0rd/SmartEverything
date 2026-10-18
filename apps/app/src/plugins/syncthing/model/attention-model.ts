import type { SyncAttention } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import { syncSectionHref } from './links';

export function attentionTarget(item: SyncAttention, deviceId: string): Href | null {
  if (item.folderId !== null) {
    return syncSectionHref(deviceId, 'folders', { folder: item.folderId });
  }
  return item.deviceId === null
    ? null
    : syncSectionHref(deviceId, 'devices', { device: item.deviceId });
}
