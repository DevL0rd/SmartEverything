import { sinkOf } from './sink';

export function perfTouch(phase: 'start' | 'move' | 'end'): void {
  sinkOf()?.touch(phase);
}
