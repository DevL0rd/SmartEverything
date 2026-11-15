import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { usePhotoBackupState } from '../data/queries';
import { folderOf } from './model';

export function OriginalQualityRow(): ReactNode {
  return (
    <ListRow
      title="Original quality"
      subtitle="Always on. Files are kept exactly as taken."
      wrapSubtitle
    />
  );
}

export function BackupFolderRow(): ReactNode {
  const backup = usePhotoBackupState();
  return (
    <ListRow title="Backup folder" subtitle={`My Drive › ${folderOf(backup.data)}`} wrapSubtitle />
  );
}
