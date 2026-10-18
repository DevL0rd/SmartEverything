import { nativeMediaFile } from '../api/connection/media-resources';
import { Logger } from '@smarteverything/logging';
import { Linking, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { notifyFailure } from '../components/toast-store';
import { isNative } from '../design/platform';

const log = new Logger('app.assistant');

const PREVIEW_MIMES: readonly string[] = ['application/pdf', 'application/json'];

export const isPreviewable = (mime: string): boolean =>
  mime.startsWith('text/') || PREVIEW_MIMES.includes(mime);

export const canShareFiles = (): boolean => isNative();

function fileAction(
  action: 'open' | 'save' | 'share',
  name: string,
  work: () => Promise<unknown>,
  failure: string,
): void {
  const operation = log.operation('file.action', { action, nameLength: name.length });
  work().then(
    () => {
      operation.succeeded();
    },
    (error: unknown) => {
      operation.failed(error);
      notifyFailure(failure)(error);
    },
  );
}

export type FileOutcome = 'completed' | 'cancelled' | 'external';

export function openFile(url: string): Promise<FileOutcome> {
  return nativeMediaFile(url, 'open').then((handled) => {
    log.debug('file.handled', { action: 'open', handled });
    if (handled === 'external') return WebBrowser.openBrowserAsync(url).then(() => handled);
    return handled;
  });
}

export function saveFile(url: string): Promise<FileOutcome> {
  return nativeMediaFile(url, 'save').then((handled) => {
    log.debug('file.handled', { action: 'save', handled });
    if (handled === 'external') return Linking.openURL(url).then(() => handled);
    return handled;
  });
}

export function shareFileLink(url: string, name: string): Promise<FileOutcome> {
  return nativeMediaFile(url, 'open').then((handled) => {
    log.debug('file.handled', { action: 'share', handled });
    if (handled === 'external')
      return Share.share({ message: url, title: name }).then(() => handled);
    return handled;
  });
}

export function previewFile(url: string, name: string): void {
  fileAction('open', name, () => openFile(url), `${name} could not be opened`);
}

export function downloadFile(url: string, name: string): void {
  fileAction('save', name, () => saveFile(url), `${name} could not be downloaded`);
}

export function shareFile(url: string, name: string): void {
  fileAction('share', name, () => shareFileLink(url, name), `${name} could not be shared`);
}
