import { readDeveloperFlags } from '../developer/flags';
import { sinkOf } from './sink';

export function perfTouch(phase: 'start' | 'move' | 'end'): void {
  if (__DEV__ && readDeveloperFlags()['perf.stalls']) {
    sinkOf()?.touch(phase);
  }
}
