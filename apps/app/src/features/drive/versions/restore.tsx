import type { ReactNode } from 'react';
import { useState } from 'react';
import type { DriveItem } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { restoreDriveVersion } from '../../../api/drive';
import { Button } from '../../../components/button';
import { notify } from '../../../components/toast-store';
import { openItemFile } from '../folder/folder-footer';
import { downloadableOf, restorePlanOf, type VersionEntry } from './versions-model';

const log = new Logger('app.drive');

export const RESTORED_MESSAGE = 'Restored as a new version';

export const RESTORED_DETAIL = 'The copy you had is kept in Versions.';

export const RESTORE_FAILED = 'The version could not be restored.';

export async function restoreVersion(item: DriveItem, versionId: string): Promise<boolean> {
  try {
    const restored = await restoreDriveVersion(item.id, versionId);
    log.info('version.restored', { itemId: item.id, versionId, rev: restored.rev });
    notify({ message: RESTORED_MESSAGE, detail: RESTORED_DETAIL });
    return true;
  } catch (error: unknown) {
    log.warn('version.restore_failed', { itemId: item.id, versionId, reason: String(error) });
    notify({ message: RESTORE_FAILED, error, tone: 'critical' });
    return false;
  }
}

function useRestore(
  item: DriveItem,
  onRestored: () => void,
): { readonly busy: boolean; readonly run: (versionId: string) => void } {
  const [busy, setBusy] = useState(false);
  const run = (versionId: string): void => {
    setBusy(true);
    background(
      restoreVersion(item, versionId).then((restored) => {
        setBusy(false);
        if (restored) onRestored();
      }),
      'drive_version.restore_failed',
    );
  };
  return { busy, run };
}

export interface RestoreButtonsProps {
  readonly item: DriveItem;
  readonly b: VersionEntry | null;
  readonly conflicted: boolean;
  readonly writable: boolean;
  readonly pointer: boolean;
  readonly onRestored: () => void;
}

export function RestoreButtons({
  item,
  b,
  conflicted,
  writable,
  pointer,
  onRestored,
}: RestoreButtonsProps): ReactNode {
  const { versionId, primary } = restorePlanOf(b, conflicted);
  const restore = useRestore(item, onRestored);
  const size = pointer ? 'md' : 'lg';
  const restoreButton = (
    <Button
      label="Restore B as new version"
      icon="history"
      variant={primary ? 'filled' : 'text'}
      size={size}
      grow={!pointer}
      loading={restore.busy}
      disabled={versionId === null || !writable}
      onPress={() => {
        if (versionId !== null) restore.run(versionId);
      }}
    />
  );
  const download = downloadableOf(b) ? (
    <Button
      label={pointer ? 'Download B' : 'Save B to this phone'}
      icon="download"
      variant="outlined"
      size={size}
      grow={!pointer}
      onPress={() => {
        openItemFile(item, true);
      }}
    />
  ) : null;
  return pointer ? (
    <>
      {download}
      {restoreButton}
    </>
  ) : (
    <>
      {restoreButton}
      {download}
    </>
  );
}
