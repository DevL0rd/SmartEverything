import { Logger } from '@smarteverything/logging';
import { readDeveloperFlags } from '../developer/flags';
import { DEVELOPER_TOGGLES, type DeveloperFlags } from '../developer/toggles';
import { attachSession, detachSession } from './sink';

const log = new Logger('app.perf');

let generation = 0;
let startedKey: string | null = null;
let pending: Promise<void> | null = null;

const PROFILED = DEVELOPER_TOGGLES.filter((toggle) => toggle.section === 'Performance');

function keyOf(flags: DeveloperFlags): string {
  return PROFILED.map((toggle) => `${toggle.id}:${String(flags[toggle.id])}`).join(',');
}

export function stopPerf(): void {
  log.debug('perf.stopping', { generation, started: startedKey !== null });
  generation += 1;
  startedKey = null;
  detachSession()?.stop();
  pending = null;
}

function loadSession(flags: DeveloperFlags, key: string): void {
  stopPerf();
  startedKey = key;
  const mine = generation;
  pending = import('./impl/start')
    .then(({ startProbe }) => {
      if (generation !== mine) {
        log.debug('perf.session_superseded', { generation: mine, current: generation });
        return;
      }
      attachSession(startProbe(flags));
      log.info('perf.session_started', { generation: mine });
    })
    .catch((error: unknown) => {
      if (generation === mine) {
        stopPerf();
        log.warn('probe.not_started', { reason: String(error) });
      }
    })
    .finally(() => {
      if (generation === mine) pending = null;
    });
}

export async function flushTimers(): Promise<void> {
  await (pending ?? Promise.resolve());
}

export function startPerf(): void {
  const flags = readDeveloperFlags();
  if (!flags['perf.sampling']) {
    if (startedKey !== null) stopPerf();
    return;
  }
  const key = keyOf(flags);
  if (startedKey === key) {
    log.trace('perf.start_skipped', { reason: 'unchanged' });
    return;
  }
  loadSession(flags, key);
}
