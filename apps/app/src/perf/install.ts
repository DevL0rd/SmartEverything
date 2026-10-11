import { Logger } from '@smarteverything/logging';
import { developerFlags } from '../developer/flags';
import { setSink } from './sink';

export function startPerf(): void {
  if (__DEV__ && developerFlags['perf.sampling']) {
    import('./impl/start')
      .then((loaded) => {
        setSink(loaded.startProbe(developerFlags));
      })
      .catch((error: unknown) => {
        new Logger('app.perf').warn('probe.not_started', { reason: String(error) });
      });
  }
}
