import { powerMonitor } from 'electron';
import { systemRingClock } from './ring-clock.js';
import { electronRingNotifier } from './ring-notifier.js';
import { RingScheduler } from './ring-scheduler.js';
import type { RingOutcomes } from './ring-types.js';
import { RingWindows } from './ring-window.js';

export function registerPlannerRing(outcomes: RingOutcomes): RingScheduler {
  const scheduler = new RingScheduler({
    clock: systemRingClock,
    surface: new RingWindows(),
    notifier: electronRingNotifier,
    outcomes,
  });
  powerMonitor.on('suspend', () => {
    scheduler.suspend();
  });
  powerMonitor.on('resume', () => {
    scheduler.resume();
  });
  return scheduler;
}
