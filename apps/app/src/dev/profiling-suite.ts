import { Logger } from '@smarteverything/logging';
import type { DeveloperFlags, ProfilingFlagId } from '../developer/toggles';
import { startBridgeProbe } from './bridge-probe';
import { startFrameProbe } from './frame-probe';
import { startGcProbe } from './gc-probe';
import { startLeakProbe } from './leak-probe';
import { startMediaProbe } from './media-probe';
import { startNativeProbe } from './native-probe';
import { startObserverProbe } from './observer-probe';
import { logStartup } from './startup-probe';
import { startStorageProbe } from './storage-probe';
import { startTimerProbe } from './timer-probe';
import { addContributor } from './window-bus';
import { startWireProbe } from './wire-probe';

type Starter = () => () => void;

function marker(name: string, field: string): Starter {
  return () => addContributor(name, { fields: () => ({ [field]: 1 }) });
}

function startupOnFirstWindow(): () => void {
  return addContributor('startup', {
    fields: () => {
      logStartup();
      return {};
    },
  });
}

const PROBE_STARTERS: Readonly<Record<ProfilingFlagId, Starter>> = {
  'perf.frames': startFrameProbe,
  'perf.gc': startGcProbe,
  'perf.native': startNativeProbe,
  'perf.timers': startTimerProbe,
  'perf.leaks': startLeakProbe,
  'perf.wire': startWireProbe,
  'perf.bridge': startBridgeProbe,
  'perf.storage': startStorageProbe,
  'perf.startup': startupOnFirstWindow,
  'perf.observer': startObserverProbe,
  'perf.media': startMediaProbe,
  'perf.cpu': marker('cpu', 'cpuCapture'),
  'perf.heap': marker('heap', 'heapCapture'),
};

const PROBE_IDS = Object.keys(PROBE_STARTERS).filter(
  (id): id is ProfilingFlagId => id in PROBE_STARTERS,
);
const log = new Logger('app.perf');
const running = new Map<ProfilingFlagId, () => void>();

function startProbe(id: ProfilingFlagId): void {
  try {
    running.set(id, PROBE_STARTERS[id]());
    log.info('probe.started', { probe: id, running: running.size });
  } catch (error: unknown) {
    log.warn('probe.not_started', { probe: id, reason: String(error) });
  }
}

function stopProbe(id: ProfilingFlagId, stop: () => void): void {
  running.delete(id);
  try {
    stop();
    log.info('probe.stopped', { probe: id, running: running.size });
  } catch (error: unknown) {
    log.warn('probe.not_stopped', { probe: id, reason: String(error) });
  }
}

export function reconcileProbes(flags: DeveloperFlags): void {
  log.debug('probe.reconciled', () => ({
    dev: __DEV__,
    wanted: PROBE_IDS.filter((id) => flags[id]).length,
    running: running.size,
  }));
  PROBE_IDS.forEach((id) => {
    const stop = running.get(id);
    const wanted = __DEV__ && flags[id];
    if (wanted && stop === undefined) {
      startProbe(id);
    }
    if (!wanted && stop !== undefined) {
      stopProbe(id, stop);
    }
  });
}
