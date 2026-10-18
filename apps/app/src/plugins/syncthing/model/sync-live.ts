import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { SeriesReading } from '../../../store/computer-series';
import { liveSeriesId } from '../../shared/use-source-live';

export const SYNC_DOWNLOAD = liveSeriesId('sync_download_rate');
export const SYNC_UPLOAD = liveSeriesId('sync_upload_rate');

export function syncReadings(snapshot: SyncthingSnapshot): readonly SeriesReading[] {
  if (snapshot.connection.state !== 'online' || !snapshot.ratesLive) {
    return [];
  }
  return [
    [SYNC_DOWNLOAD, snapshot.summary.downloadBytesPerSecond],
    [SYNC_UPLOAD, snapshot.summary.uploadBytesPerSecond],
  ];
}
