import { developerFlags } from '../developer/flags';
import { sinkOf } from './sink';

export function perfTouch(phase: 'start' | 'move' | 'end'): void {
  if (developerFlags['perf.stalls']) {
    sinkOf()?.touch(phase);
  }
}
