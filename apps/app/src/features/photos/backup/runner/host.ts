import { useQueryClient } from '@tanstack/react-query';
import { photoKeys } from '../../data/keys';
import { useEffect } from 'react';
import { Logger, background } from '@smarteverything/logging';
import { useConnection, type ServerConnection } from '../../../../api/transport';
import { connectionState } from '../../../../api/connection/connection';
import type { EntityStore } from '../../../../store/entity-store';
import { useEntityStore } from '../../../../store/store-context';
import { prefOf, PREFS } from '../../../../store/prefs';
import { backupStatus, INITIAL_BACKUP_STATUS } from '../model/status';
import { syncBackupSlot } from './background';
import { backupOwner, backupOwnerKey, type BackupOwner } from './host-state';
import { createBackupScope } from './scope';
import { backupSessions } from './sessions';
import type { SettingsPort } from './ports';
import { backupAvailable } from './platform-adapters';
import { DESKTOP_COMPUTER_IDENTITY } from '@smarteverything/domain';
import { appPlatform, desktopBridge } from '../../../../design/platform';

const log = new Logger('app.photos');

function settingsOf(store: EntityStore): SettingsPort {
  return {
    read(): ReturnType<SettingsPort['read']> {
      const pref = prefOf(store.get(), PREFS.photosBackup);
      if (pref.status === 'invalid') throw new Error(pref.reason);
      return pref.value;
    },
    subscribe(listener): () => void {
      let seen = JSON.stringify(prefOf(store.get(), PREFS.photosBackup));
      return store.subscribe(() => {
        const next = JSON.stringify(prefOf(store.get(), PREFS.photosBackup));
        if (next === seen) return;
        seen = next;
        listener();
      });
    },
  };
}

class BackupHost {
  private stopped = false;
  private seen: string | null | undefined;
  private revision = 0;
  private identityRevision = 0;
  private desktopDeviceId: string | null | undefined =
    appPlatform() === 'desktop' ? null : undefined;

  constructor(
    private readonly store: EntityStore,
    private readonly connection: ServerConnection,
  ) {}

  private current = (): boolean => {
    const paired = connectionState.get();
    return !this.stopped && paired.status === 'paired' && paired.connection === this.connection;
  };

  start(): () => void {
    const offs = [this.store.subscribe(this.refresh), connectionState.subscribe(this.refresh)];
    const bridge = desktopBridge();
    if (bridge !== null) {
      offs.push(bridge.onServiceStatus(this.refreshIdentity));
      this.refreshIdentity();
    }
    this.refresh();
    return (): void => {
      this.stopped = true;
      for (const off of offs) off();
      background(backupSessions.setForeground(null), 'backup.stop_failed');
      log.info('backup.host_stopped');
    };
  }

  private refreshIdentity = (): void => {
    const bridge = desktopBridge();
    if (bridge?.computerIdentity === undefined) return;
    const revision = ++this.identityRevision;
    background(
      bridge.computerIdentity().then(
        (answer) => {
          if (this.stopped || revision !== this.identityRevision) return;
          this.desktopDeviceId = DESKTOP_COMPUTER_IDENTITY.parse(answer).device_id;
          this.refresh();
        },
        (error: unknown) => {
          if (this.stopped || revision !== this.identityRevision) return;
          this.desktopDeviceId = null;
          this.refresh();
          throw error;
        },
      ),
      'backup.identity_failed',
    );
  };

  private refresh = (): void => {
    const state = this.store.get();
    const key = this.current() ? backupOwnerKey(state, this.desktopDeviceId) : null;
    const pref = prefOf(state, PREFS.photosBackup);
    const enabled = key !== null && pref.status !== 'invalid' && pref.value.enabled;
    if (appPlatform() === 'android')
      background(syncBackupSlot(enabled && backupAvailable()), 'backup.slot_failed');
    if (key === this.seen) return;
    this.seen = key;
    this.revision += 1;
    background(backupSessions.setForeground(null), 'backup.stop_failed');
    const owner = this.current() ? backupOwner(state, this.desktopDeviceId) : null;
    if (owner !== null) this.open(owner, key);
    else {
      backupStatus.set({
        ...INITIAL_BACKUP_STATUS,
        problem: pref.status === 'invalid' ? pref.reason : null,
      });
    }
  };

  private open(owner: BackupOwner, key: string | null): void {
    const run = this.revision;
    const valid = (): boolean =>
      this.current() && key === backupOwnerKey(this.store.get(), this.desktopDeviceId);
    const scope = createBackupScope({
      ...owner,
      connection: this.connection,
      settings: settingsOf(this.store),
      current: valid,
    })
      .then(async (value) => {
        if (valid() && run === this.revision) await backupSessions.setForeground(value);
      })
      .catch((error: unknown) => {
        if (valid() && run === this.revision) {
          backupStatus.set({
            ...INITIAL_BACKUP_STATUS,
            phase: backupAvailable() ? 'idle' : 'unavailable',
            problem: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      });
    background(scope, 'backup.scope_failed');
  }
}

export function watchBackupHost(store: EntityStore, connection: ServerConnection): () => void {
  return new BackupHost(store, connection).start();
}

export function PhotosBackupHost(): null {
  const client = useQueryClient();
  useEffect(() => {
    let previous = backupStatus.get();
    return backupStatus.subscribe(() => {
      const status = backupStatus.get();
      if (status.phase === 'idle' && previous.phase !== 'idle') {
        background(
          Promise.all([
            client.invalidateQueries({ queryKey: photoKeys.backup() }),
            client.invalidateQueries({ queryKey: photoKeys.railCounts() }),
          ]),
          'backup.queries_failed',
        );
      }
      previous = status;
    });
  }, [client]);
  const store = useEntityStore();
  const state = useConnection();
  const connection = state.status === 'paired' ? state.connection : null;
  useEffect(
    () => (connection === null ? undefined : watchBackupHost(store, connection)),
    [store, connection],
  );
  return null;
}
