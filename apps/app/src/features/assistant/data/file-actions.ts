import { nativeMediaFile } from '../../../api/connection/media-resources';
import { Linking, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { notify } from '../../../components/toast-store';
import { isNative } from '../../../design/platform';

const PREVIEW_MIMES: readonly string[] = ['application/pdf', 'application/json'];

export const isPreviewable = (mime: string): boolean =>
  mime.startsWith('text/') || PREVIEW_MIMES.includes(mime);

export const canShareFiles = (): boolean => isNative();

function failed(message: string, error: unknown): void {
  notify({ message, error, tone: 'critical' });
}

export function previewFile(url: string, name: string): void {
  nativeMediaFile(url, 'open')
    .then((handled) => {
      if (handled === 'external') return WebBrowser.openBrowserAsync(url);
      return undefined;
    })
    .catch((error: unknown) => {
      failed(`${name} could not be opened`, error);
    });
}

export function downloadFile(url: string, name: string): void {
  nativeMediaFile(url, 'save')
    .then((handled) => {
      if (handled === 'external') return Linking.openURL(url);
      return undefined;
    })
    .catch((error: unknown) => {
      failed(`${name} could not be downloaded`, error);
    });
}

export function shareFile(url: string, name: string): void {
  nativeMediaFile(url, 'open')
    .then((handled) => {
      if (handled === 'external') return Share.share({ message: url, title: name });
      return undefined;
    })
    .catch((error: unknown) => {
      failed(`${name} could not be shared`, error);
    });
}
