import { connectionState } from '../../../api/connection/connection';
import type { EntityStore } from '../../../store/entity-store';
import { sameSessionAuthority } from '../../../store/session-authority';
import { prefOf, PREFS, savePref } from '../../../store/prefs';
import { backupAccessPort } from './runner/platform-adapters';

export async function changeBackupEnabled(store: EntityStore, enabled: boolean): Promise<void> {
  const session = store.get().session;
  const paired = connectionState.get();
  if (paired.status !== 'paired') return;
  const connection = paired.connection;
  if (enabled) await backupAccessPort().requestAccess();
  const current = connectionState.get();
  if (
    current.status !== 'paired' ||
    current.connection !== connection ||
    !sameSessionAuthority(store.get().session, session)
  )
    return;
  const pref = prefOf(store.get(), PREFS.photosBackup);
  if (pref.status === 'invalid') throw new Error(pref.reason);
  savePref(store, PREFS.photosBackup, { ...pref.value, enabled });
}
