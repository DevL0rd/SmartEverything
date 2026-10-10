import { platform } from 'node:process';
import type { Logger } from '@smarteverything/logging';
import { SessionBus } from '../node/controls/linux/dbus-session';
import { watchClockDrift } from './drift';
import { watchLogind } from './resume-logind';

const DRIFT_INTERVAL_MS = 5000;
const DRIFT_TOLERANCE_MS = 3000;

export interface ResumeWatchOptions {
  readonly log: Logger;
  readonly onResume: () => void;
}

export function watchResume(options: ResumeWatchOptions): () => void {
  if (platform === 'linux') {
    return watchLogind(SessionBus.system(), options);
  }
  return watchClockDrift({
    intervalMs: DRIFT_INTERVAL_MS,
    toleranceMs: DRIFT_TOLERANCE_MS,
    now: Date.now,
    onResume: () => {
      options.log.info('clock.jumped', { source: 'drift' });
      options.onResume();
    },
  });
}
