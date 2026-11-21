import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { PhotosProgressNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { ValueStore, useValue } from '../../../design/external-store';
import { onPhotosProgress } from '../../drive';
import { photoKeys } from '../data';
import {
  NO_DEVICE_PROGRESS,
  NO_KIND_PROGRESS,
  deviceProgressAfter,
  kindProgressAfter,
  type DeviceProgress,
  type KindProgress,
} from './phones-model';

const deviceProgress = new ValueStore<DeviceProgress>(NO_DEVICE_PROGRESS);
const kindProgress = new ValueStore<KindProgress>(NO_KIND_PROGRESS);

function settled(client: QueryClient, notice: PhotosProgressNotice): void {
  if (notice.done !== notice.total) return;
  const queryKey = notice.kind === 'backup' ? photoKeys.backup() : photoKeys.processing();
  background(client.invalidateQueries({ queryKey }), 'queries.invalidate_failed');
}

export function receivePhotosLiveProgress(client: QueryClient, notice: PhotosProgressNotice): void {
  if (notice.kind === 'backup') {
    deviceProgress.update((current) => deviceProgressAfter(current, notice));
  } else {
    kindProgress.update((current) => kindProgressAfter(current, notice));
  }
  settled(client, notice);
}

export function startPhotosLiveProgress(client: QueryClient): () => void {
  return onPhotosProgress((notice) => {
    receivePhotosLiveProgress(client, notice);
  });
}

export function PhotosLiveProgressHost(): null {
  const client = useQueryClient();
  useEffect(() => startPhotosLiveProgress(client), [client]);
  return null;
}

export function useDeviceProgress(): DeviceProgress {
  return useValue(deviceProgress);
}

export function useKindProgress(): KindProgress {
  return useValue(kindProgress);
}
