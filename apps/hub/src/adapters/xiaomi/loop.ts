import { Loop } from '../../plugins/loop';

export type { Loop };

export function startLoop(intervalMs: () => number, task: () => Promise<void>): Loop {
  const loop = new Loop(task, intervalMs);
  loop.start();
  return loop;
}
