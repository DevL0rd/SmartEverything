import { nativeMediaFile } from '../../../api/connection/media-resources';
import { Linking } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { recordingLinks } from '../../../api/media';
import { notify, notifyFailure } from '../../../components/toast-store';

const log = new Logger('app.cameras');

const notifyOpenFailed = notifyFailure('The clip didn’t open');

function failed(error: unknown): void {
  log.error('clip.failed', error);
  notifyOpenFailed(error);
}

export function openClip(url: string): void {
  log.info('clip.opening', {});
  nativeMediaFile(url, 'open')
    .then((handled) => {
      log.debug('clip.handled', { action: 'open', handled });
      if (handled === 'external') return Linking.openURL(url);
      return undefined;
    })
    .catch(failed);
}

export function saveRecording(recordingId: string): void {
  const startedAt = Date.now();
  recordingLinks([recordingId], 'full').then((links) => {
    const link = links[recordingId];
    log.info('clip.link_resolved', {
      recordingId,
      found: link !== undefined,
      latencyMs: Date.now() - startedAt,
    });
    if (link === undefined) {
      notify({ message: 'This clip isn’t saved anymore', tone: 'critical' });
      return;
    }
    nativeMediaFile(link.url, 'save')
      .then((handled) => {
        log.debug('clip.handled', { action: 'save', recordingId, handled });
        if (handled === 'external') openClip(link.url);
      })
      .catch(failed);
  }, failed);
}
