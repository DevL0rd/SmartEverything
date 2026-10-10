import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { clearSent, pendingTrail } from '../platform/crash-trail';
import { api } from './transport';

const log = new Logger('app.crash-trail');

let sending = false;

class ReleaseMissingError extends Error {
  override readonly name = 'ReleaseMissingError';

  constructor() {
    super('The Expo config carries no version, so a failure report cannot name its release.');
  }
}

function releaseOfBuild(): string {
  const version = Constants.expoConfig?.version;
  if (version === undefined) {
    throw new ReleaseMissingError();
  }
  return version;
}

export async function sendTrail(): Promise<void> {
  const pending = pendingTrail();
  if (pending === null || sending) {
    return;
  }
  sending = true;
  try {
    await api().call(E.reportClientFailures, {
      body: {
        release: releaseOfBuild(),
        platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
        failures: [...pending.failures],
        recent: [...pending.recent],
      },
    });
    await clearSent(pending.failures.length);
    log.info('trail.sent', { failures: pending.failures.length });
  } catch (error) {
    log.warn('trail.not_sent', { reason: String(error) });
  } finally {
    sending = false;
  }
}
