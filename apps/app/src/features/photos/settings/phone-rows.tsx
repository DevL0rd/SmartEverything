import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { appPlatform } from '../../../design/platform';
import { ListRow } from '../../../components/list-row';
import { NavRow, ValueRow } from '../../../components/rows';
import { useBackupStatus } from '../backup/model/status';
import { usePhotoBackupState } from '../data/queries';
import { PERSON_FOLDER_TEMPLATE, folderOf, thisPhoneText } from './model';

export function ThisPhoneRow(): ReactNode {
  const status = useBackupStatus();
  return (
    <ValueRow
      title={appPlatform() === 'desktop' ? 'This computer' : 'This phone'}
      icon={appPlatform() === 'desktop' ? 'monitor' : 'smartphone'}
      value={thisPhoneText(status)}
      {...(status.problem === null ? {} : { subtitle: status.problem, wrapSubtitle: true })}
    />
  );
}

export function OriginalQualityRow(): ReactNode {
  return (
    <ListRow
      title="Original quality"
      icon="image"
      subtitle="Always on. Files are kept exactly as taken."
      wrapSubtitle
      value="On"
    />
  );
}

export function BackupFolderRow(): ReactNode {
  const backup = usePhotoBackupState();
  return (
    <ListRow
      title="Backup folder"
      icon="folder"
      subtitle={backup.data === undefined ? PERSON_FOLDER_TEMPLATE : folderOf(backup.data)}
      wrapSubtitle
    />
  );
}

export function FreeUpRow(): ReactNode {
  return (
    <NavRow
      title="Free up space"
      icon="hardDrive"
      subtitle="Removes photos and videos from this phone that the hub already has and has checked. They stay in Photos."
      wrapSubtitle
      href={href.photosPage('backup')}
    />
  );
}
