import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../format/errors';
import { PREFS, usePref } from '../../../store/prefs';
import { HEALTH_CONNECT_ON_DEVICE, applySyncSchedule, syncWhenOpened } from './health-connect';

const log = new Logger('app.health-connect');

function failed(event: string): (error: unknown) => void {
  return (error) => {
    log.warn(event, { reason: rawErrorText(error) });
  };
}

function syncNowOpened(): void {
  syncWhenOpened().catch(failed('health.open_sync_failed'));
}

export function HealthSyncHost(): null {
  const pref = usePref(PREFS.healthSync);
  const intervalMinutes = pref.status === 'ready' ? pref.value.intervalMinutes : null;
  useEffect(() => {
    if (!HEALTH_CONNECT_ON_DEVICE || intervalMinutes === null) {
      return;
    }
    applySyncSchedule(intervalMinutes).catch(failed('health.schedule_failed'));
  }, [intervalMinutes]);
  const syncOnOpen = HEALTH_CONNECT_ON_DEVICE && intervalMinutes !== null && intervalMinutes > 0;
  useEffect(() => {
    if (!syncOnOpen) {
      return undefined;
    }
    syncNowOpened();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncNowOpened();
      }
    });
    return (): void => {
      app.remove();
    };
  }, [syncOnOpen]);
  return null;
}
