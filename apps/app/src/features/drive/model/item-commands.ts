import type { DriveChange, DriveItem } from '@smarteverything/domain';
import { changeDrive } from '../../../api/drive';
import { notify, notifyFailure } from '../../../components/toast-store';
import { downloadFile, openFile, saveFile } from '../../../platform/file-actions';
import { VIEW_ONLY_LINE } from '../../files';
import { driveLinks } from '../data';

export function runChange(change: DriveChange, failure: string, done?: () => void): void {
  changeDrive(change).then((result) => {
    const first = result.failed[0];
    if (first === undefined) done?.();
    else notify({ message: failure, detail: first.reason, tone: 'critical' });
  }, notifyFailure(failure));
}

class DriveLinkMissingError extends Error {
  override readonly name = 'DriveLinkMissingError';
}

export function openItemFile(item: DriveItem, save: boolean): void {
  driveLinks
    .resolve(item.id, item.rev, 'file')
    .then((url) => {
      if (url === null) throw new DriveLinkMissingError(`No link came back for ${item.name}.`);
      return save ? saveFile(url) : openFile(url);
    })
    .catch(notifyFailure(`${item.name} could not be opened.`));
}

export function downloadItem(item: DriveItem): void {
  driveLinks
    .resolve(item.id, item.rev, 'download')
    .then((url) => {
      if (url === null) notify({ message: VIEW_ONLY_LINE });
      else downloadFile(url, item.name);
    })
    .catch(notifyFailure(`${item.name} could not be downloaded.`));
}
