import { Logger } from '@smarteverything/logging';
import { developerFlags } from '../developer/flags';
import { DEVELOPER_TOGGLES, type DeveloperFlags } from '../developer/toggles';
import { perfRuntime } from './runtime';

const owner = Symbol('perf-owner');

function flagsKey(flags: DeveloperFlags): string {
  return DEVELOPER_TOGGLES.filter((toggle) => toggle.section === 'Performance')
    .map((toggle) => `${toggle.id}:${String(flags[toggle.id])}`)
    .join(',');
}

export function stopPerf(): void {
  if (perfRuntime.owner !== owner) {
    return;
  }
  const previous = perfRuntime.state;
  perfRuntime.generation += 1;
  perfRuntime.state = { status: 'idle' };
  if (previous.status === 'running') {
    previous.session.stop();
  }
}

perfRuntime.owner = owner;
stopPerf();

export function startPerf(): void {
  if (perfRuntime.owner !== owner) {
    return;
  }
  if (!__DEV__ || !developerFlags['perf.sampling']) {
    stopPerf();
    return;
  }
  const flags = { ...developerFlags };
  const key = flagsKey(flags);
  if (perfRuntime.state.status !== 'idle' && perfRuntime.state.key === key) {
    return;
  }
  stopPerf();
  const generation = perfRuntime.generation;
  perfRuntime.state = { status: 'starting', key };
  import('./impl/start')
    .then((loaded) => {
      if (perfRuntime.generation !== generation) {
        return;
      }
      if (flagsKey(developerFlags) !== key) {
        stopPerf();
        return;
      }
      const session = loaded.startProbe(flags);
      perfRuntime.state = { status: 'running', key, session };
      if (perfRuntime.screen !== '') {
        session.sink.screen(perfRuntime.screen);
      }
    })
    .catch((error: unknown) => {
      if (perfRuntime.generation === generation) {
        stopPerf();
        new Logger('app.perf').warn('probe.not_started', { reason: String(error) });
      }
    });
}
