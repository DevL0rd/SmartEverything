import { useEffect } from 'react';
import { AppState, PermissionsAndroid, type Permission } from 'react-native';
import { Logger } from '@smarteverything/logging';
import {
  isHealthConnectLinked,
  openDndAccess,
  openNotificationAccess,
  phoneApps,
  setWatchRelay,
  watchRelayStatus,
  type PhoneApp,
  type WatchRelayChange,
  type WatchRelayStatus,
} from '../../../modules/health-connect';
import { ValueStore, useValue } from '../../design/external-store';
import { rawErrorText } from '../../format/errors';

const log = new Logger('app.watch');

export type RelayState =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly status: WatchRelayStatus }
  | { readonly kind: 'failed'; readonly reason: string };

const relay = new ValueStore<RelayState>(
  isHealthConnectLinked ? { kind: 'loading' } : { kind: 'unsupported' },
);
const apps = new ValueStore<readonly PhoneApp[] | null>(null);

async function load(): Promise<void> {
  try {
    relay.set({ kind: 'ready', status: await watchRelayStatus() });
  } catch (error) {
    relay.set({ kind: 'failed', reason: rawErrorText(error) });
  }
}

export function useRelay(): RelayState {
  useEffect(() => {
    if (!isHealthConnectLinked) {
      return undefined;
    }
    void load();
    const back = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load();
      }
    });
    return (): void => {
      back.remove();
    };
  }, []);
  return useValue(relay);
}

export function usePhoneApps(): readonly PhoneApp[] | null {
  useEffect(() => {
    if (isHealthConnectLinked && apps.get() === null) {
      phoneApps().then(apps.set, (error: unknown) => {
        relay.set({ kind: 'failed', reason: rawErrorText(error) });
      });
    }
  }, []);
  return useValue(apps);
}

export async function changeRelay(change: WatchRelayChange): Promise<void> {
  try {
    relay.set({ kind: 'ready', status: await setWatchRelay(change) });
    log.info('watch.relay_changed', { ...change, apps: change.apps?.length ?? null });
  } catch (error) {
    relay.set({ kind: 'failed', reason: rawErrorText(error) });
  }
}

function callPermissions(): Permission[] {
  const { PERMISSIONS } = PermissionsAndroid;
  return [
    PERMISSIONS.READ_PHONE_STATE,
    PERMISSIONS.READ_CALL_LOG,
    PERMISSIONS.READ_CONTACTS,
    PERMISSIONS.ANSWER_PHONE_CALLS,
  ];
}

export async function allowCalls(on: boolean): Promise<void> {
  if (on) {
    const answers = await PermissionsAndroid.requestMultiple(callPermissions());
    log.info('watch.call_permissions_answered', answers);
  }
  await changeRelay({ calls: on });
}

export async function openAccess(which: 'notifications' | 'dnd'): Promise<void> {
  await (which === 'notifications' ? openNotificationAccess() : openDndAccess());
}
