import { Logger } from '@smarteverything/logging';
import { setSink } from './sink';

export function startPerf(): void {
  if (__DEV__) {
    import('./impl/start')
      .then((loaded) => {
        setSink(loaded.startProbe());
      })
      .catch((error: unknown) => {
        new Logger('app.perf').warn('probe.not_started', { reason: String(error) });
      });
  }
}
