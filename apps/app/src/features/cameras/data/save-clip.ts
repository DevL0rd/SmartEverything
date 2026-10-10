import { Linking } from 'react-native';
import { recordingLinks } from '../../../api/media';
import { notify } from '../../../components/toast-store';

function failed(error: unknown): void {
  notify({ message: 'The clip didn’t open', error, tone: 'critical' });
}

export function openClip(url: string): void {
  Linking.openURL(url).catch(failed);
}

export function saveRecording(recordingId: string): void {
  recordingLinks([recordingId], 'full').then((links) => {
    const link = links[recordingId];
    if (link === undefined) {
      notify({ message: 'This clip isn’t saved anymore', tone: 'critical' });
      return;
    }
    openClip(link.url);
  }, failed);
}
