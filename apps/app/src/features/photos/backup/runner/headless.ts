import { API_ENDPOINTS as E, type Snapshot } from '@smarteverything/domain';
import { api, loadConnection, type ServerConnection } from '../../../../api/transport';
import { connectionState } from '../../../../api/connection/connection';
import { routeFor, type ActiveHubRoute } from '../../../../api/connection/active-route';
import { replaceWith } from '../../../../store/live-reducers';
import { emptyState } from '../../../../store/state';
import { prefOf, PREFS } from '../../../../store/prefs';
import { backupAppIsActive } from './app-state';
import { backupOwner } from './host-state';
import { syncBackupSlot } from './background';
import { nativeBackupAvailable } from './native-adapters';
import { capturedSettings, createBackupScope } from './scope';
import { backupSessions, type BackupScope } from './sessions';

function ownsConnection(connection: ServerConnection): boolean {
  const paired = connectionState.get();
  return paired.status === 'paired' && paired.connection === connection;
}

async function readBackupSnapshot(connection: ServerConnection): Promise<Snapshot> {
  const controller = new AbortController();
  const off = connectionState.subscribe(() => {
    if (!ownsConnection(connection)) controller.abort();
  });
  try {
    if (!ownsConnection(connection)) throw new Error('Photo backup enrollment changed.');
    return await api().call(E.readSnapshot, { query: {} }, { signal: controller.signal });
  } finally {
    off();
  }
}

export async function loadHeadlessBackupScope(
  onRoute: (route: ActiveHubRoute) => void,
): Promise<BackupScope | null> {
  if (!nativeBackupAvailable()) return null;
  if (connectionState.get().status === 'loading') await loadConnection();
  const state = connectionState.get();
  if (state.status !== 'paired') {
    await syncBackupSlot(false);
    return null;
  }
  const { connection } = state;
  const manager = routeFor(connection);
  onRoute(manager);
  manager.start();
  await manager.ready();
  const snapshot = await readBackupSnapshot(connection);
  if (!ownsConnection(connection)) return null;
  const data = replaceWith(emptyState(), snapshot);
  const owner = backupOwner(data);
  const pref = prefOf(data, PREFS.photosBackup);
  if (owner === null || pref.status === 'invalid' || !pref.value.enabled) {
    await syncBackupSlot(false);
    return null;
  }
  return createBackupScope({
    ...owner,
    connection,
    settings: capturedSettings(pref.value),
    current: () => ownsConnection(connection),
  });
}

export async function runHeadlessBackup(): Promise<void> {
  const routes = new Set<ActiveHubRoute>();
  try {
    await backupSessions.runBackground(() =>
      loadHeadlessBackupScope((route) => {
        routes.add(route);
      }),
    );
  } finally {
    if (!backupSessions.hasForeground && !backupAppIsActive()) {
      for (const route of routes) route.stop();
    }
  }
}
