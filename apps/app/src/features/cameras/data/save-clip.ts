import { nativeMediaFile } from '../../../api/connection/media-resources';
import { Linking } from 'react-native';
import { recordingLinks } from '../../../api/media';
import { notify } from '../../../components/toast-store';

function failed(error: unknown): void {
  notify({ message: 'The clip didn’t open', error, tone: 'critical' });
}

export function openClip(url: string): void {
  nativeMediaFile(url, 'open')
    .then((handled) => {
      if (handled === 'external') return Linking.openURL(url);
      return undefined;
    })
    .catch(failed);
}

export function saveRecording(recordingId: string): void {
  recordingLinks([recordingId], 'full').then((links) => {
    const link = links[recordingId];
    if (link === undefined) {
      notify({ message: 'This clip isn’t saved anymore', tone: 'critical' });
      return;
    }
    nativeMediaFile(link.url, 'save')
      .then((handled) => {
        if (handled === 'external') openClip(link.url);
      })
      .catch(failed);
  }, failed);
}
