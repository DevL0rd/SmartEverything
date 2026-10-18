import { Logger } from '@smarteverything/logging';
import { nativeMediaFile } from '../../../api/connection/media-resources';
import { cameraSnapshotLink } from '../../../api/media';
import { notify } from '../../../components/toast-store';
import type { CaptureMode, FrameCapture, MediaHandle, Transport } from './peer-types';
import { captureFrame, capturesVideoFrames, saveServerPicture } from './rtc';
import { pictureSourceOf, snapshotNameOf } from './snapshot-source';

const log = new Logger('app.camera-snapshot');

export interface SnapshotSource {
  readonly media: MediaHandle | null;
  readonly transport: Transport;
  readonly deviceId: string;
  readonly name: string;
}

async function capture(source: SnapshotSource, mode: CaptureMode): Promise<FrameCapture | null> {
  const name = snapshotNameOf(source.name, new Date());
  const picture = pictureSourceOf(source.transport, source.media, capturesVideoFrames());
  log.debug('snapshot.source_chosen', {
    deviceId: source.deviceId,
    source: picture.kind,
    transport: source.transport,
    mode,
  });
  if (picture.kind === 'video') {
    return captureFrame(picture.media, name, mode);
  }
  const link = await cameraSnapshotLink(source.deviceId, 'full');
  const native = await nativeMediaFile(link.url, mode === 'download' ? 'save' : 'open');
  log.debug('snapshot.native_file', { deviceId: source.deviceId, result: native });
  if (native === 'cancelled') return null;
  if (native === 'completed') return { kind: mode === 'download' ? 'saved' : 'opened', name };
  return saveServerPicture(link.url, name, mode);
}

function told(captured: FrameCapture): void {
  switch (captured.kind) {
    case 'saved':
      notify({ message: 'Snapshot saved', detail: captured.name, tone: 'positive' });
      return;
    case 'shared':
      notify({ message: 'Snapshot shared', tone: 'positive' });
      return;
    case 'opened':
      notify({ message: 'Snapshot opened', detail: 'Save or share it from the picture.' });
      return;
    case 'unavailable':
      notify({ message: 'No snapshot', error: captured.reason, tone: 'critical' });
  }
}

export function takeSnapshot(source: SnapshotSource, mode: CaptureMode): void {
  const startedAt = Date.now();
  capture(source, mode).then(
    (captured) => {
      log.info('snapshot.finished', {
        deviceId: source.deviceId,
        mode,
        outcome: captured?.kind ?? 'cancelled',
        latencyMs: Date.now() - startedAt,
      });
      if (captured !== null) told(captured);
    },
    (error: unknown) => {
      log.error('snapshot.failed', error, {
        deviceId: source.deviceId,
        mode,
        latencyMs: Date.now() - startedAt,
      });
      notify({
        message: 'The snapshot didn’t save',
        error,
        tone: 'critical',
      });
    },
  );
}
