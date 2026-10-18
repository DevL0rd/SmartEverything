import { Logger } from '@smarteverything/logging';
import { readDeveloperFlags } from '../developer/flags';
import { DEVELOPER_TOGGLES } from '../developer/toggles';
import { attachSession, detachSession } from './sink';

const log = new Logger('app.perf');

let generation = 0;
let startedKey: string | null = null;

export function stopPerf(): void {
  log.debug('perf.stopping', { generation, started: startedKey !== null });
  generation += 1;
  startedKey = null;
  detachSession()?.stop();
}

export function startPerf(): void {
  const flags = readDeveloperFlags();
  if (!__DEV__ || !flags['perf.sampling']) {
    stopPerf();
    return;
  }
  const key = DEVELOPER_TOGGLES.filter((toggle) => toggle.section === 'Performance')
    .map((toggle) => `${toggle.id}:${String(flags[toggle.id])}`)
    .join(',');
  if (startedKey === key) {
    log.trace('perf.start_skipped', { reason: 'unchanged' });
    return;
  }
  stopPerf();
  startedKey = key;
  const mine = generation;
  import('./impl/start')
    .then((loaded) => {
      if (generation === mine) {
        attachSession(loaded.startProbe(flags));
        log.info('perf.session_started', { generation: mine });
      } else {
        log.debug('perf.session_superseded', { generation: mine, current: generation });
      }
    })
    .catch((error: unknown) => {
      if (generation === mine) {
        stopPerf();
        log.warn('probe.not_started', { reason: String(error) });
      }
    });
}
