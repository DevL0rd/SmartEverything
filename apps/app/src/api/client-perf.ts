import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import Constants from 'expo-constants';
import { api } from './transport';

const log = new Logger('app.perf');

class ReleaseMissingError extends Error {
  override readonly name = 'ReleaseMissingError';

  constructor() {
    super('The Expo config carries no version, so a performance report cannot name its release.');
  }
}

function releaseOfBuild(): string {
  const version = Constants.expoConfig?.version;
  if (version === undefined) throw new ReleaseMissingError();
  return version;
}

export async function sendPerfLines(lines: readonly string[], screen: string): Promise<void> {
  try {
    await api().call(E.reportClientPerf, {
      body: {
        at: new Date().toISOString(),
        release: releaseOfBuild(),
        screen: screen.slice(0, 120),
        lines: [...lines],
      },
    });
  } catch (error) {
    log.debug('perf.not_sent', { reason: String(error) });
  }
}
