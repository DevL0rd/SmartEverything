import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Logger } from '@smarteverything/logging';
import { startLoopWatchdog, type LoopWatchdog } from './start';

const SCRIPT = fileURLToPath(new URL('./loop-watchdog.mjs', import.meta.url));

export interface BundledWatchdogOptions {
  readonly name: string;
  readonly logPath: string;
  readonly release: string;
  readonly exitAfterMs: number;
  readonly log: Logger;
}

export function startBundledWatchdog(options: BundledWatchdogOptions): LoopWatchdog | null {
  if (!existsSync(SCRIPT)) {
    options.log.warn('loop.watchdog_unavailable', {
      name: options.name,
      script: SCRIPT,
      consequence: 'a starved event loop is not detected, so it would not be restarted',
    });
    return null;
  }
  return startLoopWatchdog({ ...options, script: SCRIPT });
}
