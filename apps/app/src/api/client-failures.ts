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
        platform: platformOfBuild(),
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

const PERF_SCOPE = 'app.perf';
const PERF_EVENT = 'perf.sample';

function platformOfBuild(): 'android' | 'ios' | 'web' {
  return Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
}

export async function sendPerfLines(lines: readonly string[], screen: string): Promise<void> {
  const at = new Date().toISOString();
  try {
    await api().call(E.reportClientFailures, {
      body: {
        release: releaseOfBuild(),
        platform: platformOfBuild(),
        failures: lines.map((line) => ({
          at,
          level: 'warn' as const,
          scope: PERF_SCOPE,
          event: PERF_EVENT,
          screen: screen.slice(0, 120),
          name: null,
          message: line,
          stack: null,
        })),
        recent: [],
      },
    });
  } catch (error) {
    log.debug('perf.not_sent', { reason: String(error) });
  }
}
