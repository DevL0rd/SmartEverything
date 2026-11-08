import { readDeveloperFlags } from '../developer/flags';
import { sinkOf } from './sink';

export function perfTouch(phase: 'start' | 'move' | 'end'): void {
  const sink = sinkOf();
  if (sink !== null && readDeveloperFlags()['perf.stalls']) {
    sink.touch(phase);
  }
}
