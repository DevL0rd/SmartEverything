import { background } from '@smarteverything/logging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PHOTOS_ENDPOINTS as E,
  type HubConnectionMetadata,
  type BackupHave,
  type BackupRegister,
  type PhotosBackupPref,
} from '@smarteverything/domain';
import { api, type ServerConnection } from '../../../../api/transport';
import { routeFor } from '../../../../api/connection/active-route';
import { connectionState } from '../../../../api/connection/connection';
import { readHubTrust } from '../../../../api/connection/trust-storage';
import { appStateSource } from './app-state';
import { scopedBackupStorage } from './scoped-storage';
import type { BackupDeviceIdentity } from '../model/types';
import type { BackupHubPort, BackupPorts, SettingsPort } from './ports';
import type { BackupScope } from './sessions';
import { attachBackupTriggers } from './triggers';
import { backupAdapters, backupAvailable } from './platform-adapters';

export interface ScopeInput {
  readonly connection: ServerConnection;
  readonly clientId: string;
  readonly profileId: string;
  readonly identity: BackupDeviceIdentity;
  readonly settings: SettingsPort;
  readonly current: () => boolean;
}

export function backupScopeKey(
  hubId: string,
  clientId: string,
  profileId: string,
  deviceId: string,
): string {
  return JSON.stringify([hubId, clientId, profileId, deviceId]);
}

export function capturedSettings(value: PhotosBackupPref): SettingsPort {
  return { read: () => value, subscribe: () => () => undefined };
}

function sameConnection(connection: ServerConnection): boolean {
  const state = connectionState.get();
  return state.status === 'paired' && state.connection === connection;
}

function hubPort(signal: AbortSignal, current: () => boolean): BackupHubPort {
  const client = api();
  const checked = (): void => {
    if (!current()) throw new Error('Photo backup authority changed.');
  };
  return {
    register(body: BackupRegister): ReturnType<BackupHubPort['register']> {
      checked();
      return client.call(E.registerBackupDevice, { body }, { signal });
    },
    checkHashes(
      body: BackupHave,
      purpose: 'lookup' | 'backup',
    ): ReturnType<BackupHubPort['checkHashes']> {
      checked();
      return client.call(
        purpose === 'lookup' ? E.lookupPhotoBackupHashes : E.checkBackupHashes,
        { body },
        { signal },
      );
    },
    resolveTarget(deviceId: string, takenAt: string): ReturnType<BackupHubPort['resolveTarget']> {
      checked();
      return client.call(
        E.resolvePhotoUploadTarget,
        {
          body: { kind: 'backup', deviceId, takenAt },
        },
        { signal },
      );
    },
  };
}

function portsOf(
  input: ScopeInput,
  key: string,
  current: () => boolean,
  signal: AbortSignal,
): BackupPorts {
  return {
    ...backupAdapters(input.connection, key),
    settings: input.settings,
    identity: input.identity,
    available: () => current() && backupAvailable(),
    now: () => new Date(),
    storage: scopedBackupStorage(AsyncStorage, key, current),
    hub: hubPort(signal, current),
  };
}

async function trustOf(input: ScopeInput): Promise<HubConnectionMetadata | null> {
  const saved = await readHubTrust(input.connection);
  if (saved !== null) return saved;
  if (!input.current() || !sameConnection(input.connection)) return null;
  await routeFor(input.connection).ready();
  return readHubTrust(input.connection);
}

export async function createBackupScope(input: ScopeInput): Promise<BackupScope> {
  const trust = await trustOf(input);
  if (trust === null) throw new Error('Photo backup needs the paired hub identity.');
  const { connection, identity } = input;
  const key = backupScopeKey(trust.identity.id, input.clientId, input.profileId, identity.deviceId);
  return {
    key,
    authority: connection,
    create(active, signal): BackupPorts {
      const current = (): boolean => active() && input.current() && sameConnection(connection);
      return portsOf(input, key, current, signal);
    },
    attach(runner, ports, invalidate): () => void {
      if (!backupAvailable()) {
        background(runner.request(), 'backup.unavailable_failed');
        return () => undefined;
      }
      const off = attachBackupTriggers(runner, ports, appStateSource);
      const connectionOff = connectionState.subscribe(() => {
        if (!sameConnection(connection)) invalidate();
      });
      return (): void => {
        off();
        connectionOff();
      };
    },
  };
}
