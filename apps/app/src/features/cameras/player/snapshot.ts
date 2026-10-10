import { cameraSnapshotLink } from '../../../api/media';
import { notify } from '../../../components/toast-store';
import type { CaptureMode, FrameCapture, MediaHandle, Transport } from './peer-types';
import { captureFrame, capturesVideoFrames, saveServerPicture } from './rtc';
import { pictureSourceOf, snapshotNameOf } from './snapshot-source';

export interface SnapshotSource {
  readonly media: MediaHandle | null;
  readonly transport: Transport;
  readonly deviceId: string;
  readonly name: string;
}

async function capture(source: SnapshotSource, mode: CaptureMode): Promise<FrameCapture> {
  const name = snapshotNameOf(source.name, new Date());
  const picture = pictureSourceOf(source.transport, source.media, capturesVideoFrames());
  if (picture.kind === 'video') {
    return captureFrame(picture.media, name, mode);
  }
  const link = await cameraSnapshotLink(source.deviceId, 'full');
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
  capture(source, mode).then(told, (error: unknown) => {
    notify({
      message: 'The snapshot didn’t save',
      error,
      tone: 'critical',
    });
  });
}
