import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { kill, pid } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { Logger, renderJson } from '@smarteverything/logging';
import { captureMainStack } from './stall-stack';
import {
  BEAT_SEQUENCE,
  BEAT_STOPPING,
  STACK_WAIT_MS,
  WATCHDOG_DATA,
  type WatchdogMessage,
} from './settings';

const data = WATCHDOG_DATA.parse(workerData);
const beat = new Int32Array(data.beat);

Logger.configure({
  level: 'info',
  context: { platform: 'server', release: data.release },
  sink: (record) => {
    appendFileSync(data.logPath, `${renderJson(record)}\n`);
  },
});

const log = new Logger('hub.watchdog');
let seen = Atomics.load(beat, BEAT_SEQUENCE);
let changedAt = performance.now();
let frames: readonly string[] | null = null;
let capturing = false;

function report(stalledMs: number, found: readonly string[]): void {
  const message: WatchdogMessage = { kind: 'stalled', stalledMs, frames: [...found] };
  parentPort?.postMessage(message);
  log.warn('loop.stalled', { name: data.name, stalledMs: Math.round(stalledMs), frames: found });
}

function capture(stalledMs: number): void {
  capturing = true;
  captureMainStack(STACK_WAIT_MS).then(
    (found) => {
      frames = found;
      report(stalledMs, found);
    },
    (cause: unknown) => {
      log.error('loop.stack_failed', cause, { name: data.name });
    },
  );
}

function die(stalledMs: number): void {
  log.error('loop.starved', undefined, {
    name: data.name,
    stalledMs: Math.round(stalledMs),
    limitMs: data.exitAfterMs,
    frames: frames ?? [],
    consequence: 'the process is killed so that the service manager starts it again',
  });
  kill(pid, 'SIGKILL');
}

function check(): void {
  if (Atomics.load(beat, BEAT_STOPPING) !== 0) {
    return;
  }
  const now = performance.now();
  const sequence = Atomics.load(beat, BEAT_SEQUENCE);
  if (sequence !== seen) {
    seen = sequence;
    changedAt = now;
    frames = null;
    capturing = false;
    return;
  }
  const stalledMs = now - changedAt;
  if (stalledMs >= data.exitAfterMs) {
    die(stalledMs);
  } else if (stalledMs >= data.stackAfterMs && !capturing) {
    capture(stalledMs);
  }
}

setInterval(check, data.tickMs);
