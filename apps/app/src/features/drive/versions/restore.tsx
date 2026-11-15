import type { ReactNode } from 'react';
import { useState } from 'react';
import type { DriveItem } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { restoreDriveVersion } from '../../../api/drive';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { downloadItem } from '../model/item-commands';
import {
  downloadableOf,
  restorePlanOf,
  whenOf,
  type Clock,
  type VersionEntry,
} from './versions-model';

const log = new Logger('app.drive');

export const RESTORED_MESSAGE = 'Restored as a new version';

export const RESTORED_DETAIL = 'The copy you had is kept in Versions.';

export const RESTORE_FAILED = 'The version could not be restored.';

export const RESTORE_CONFIRM_TITLE = 'Restore this version?';

export function restoreConfirmBody(when: string): string {
  return `The version from ${when} becomes the current file. The file you have now is kept in Versions.`;
}

export async function restoreVersion(
  item: DriveItem,
  versionId: string,
  when: string,
): Promise<boolean> {
  const accepted = await confirm({
    title: RESTORE_CONFIRM_TITLE,
    body: restoreConfirmBody(when),
    confirmLabel: 'Restore',
  });
  if (!accepted) {
    log.info('version.restore_cancelled', { itemId: item.id, versionId });
    return false;
  }
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

export function useRestore(
  item: DriveItem,
  onRestored: () => void,
): { readonly busy: boolean; readonly run: (versionId: string, when: string) => void } {
  const [busy, setBusy] = useState(false);
  const run = (versionId: string, when: string): void => {
    setBusy(true);
    background(
      restoreVersion(item, versionId, when).then((restored) => {
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
  readonly b: VersionEntry;
  readonly conflicted: boolean;
  readonly writable: boolean;
  readonly pointer: boolean;
  readonly time: Clock;
  readonly onRestored: () => void;
}

export function RestoreButtons({
  item,
  b,
  conflicted,
  writable,
  pointer,
  time,
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
        if (versionId !== null) restore.run(versionId, whenOf(b, time));
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
        downloadItem(item);
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
