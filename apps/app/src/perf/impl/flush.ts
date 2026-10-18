import Constants from 'expo-constants';
import { Logger, background } from '@smarteverything/logging';
import { Uniwind } from 'uniwind';
import { sendPerfLines } from '../../api/client-failures';
import { isIdle } from './collector';
import { encodeWindow } from './encode';
import { readMemory } from './globals';
import type { Probe } from './probe';

const log = new Logger('app.perf');

function bootId(): string {
  return Math.floor(Math.random() * 65536)
    .toString(16)
    .padStart(4, '0');
}

export function makeFlush(probe: Probe, upload: boolean): () => void {
  const boot = bootId();
  let seq = 0;
  let before = readMemory();
  return (): void => {
    if (isIdle(probe.data)) {
      probe.visits.take(performance.now());
      probe.reset();
      return;
    }
    const memory = readMemory();
    const lines = encodeWindow(probe.data, {
      boot,
      seq,
      version: Constants.expoConfig?.version ?? 'unknown',
      theme: Uniwind.currentTheme,
      heapMb: memory.heapMb,
      gcCount:
        memory.gcCount === null || before.gcCount === null ? null : memory.gcCount - before.gcCount,
      gcMs:
        memory.gcMs === null || before.gcMs === null ? null : Math.round(memory.gcMs - before.gcMs),
      fibers: probe.fibers,
      screen: probe.screenName,
      visited: probe.visits.take(performance.now()),
    });
    seq += 1;
    before = memory;
    log.info('perf.sample', { reason: lines.join('\n') });
    if (upload) {
      background(sendPerfLines(lines, probe.screenName), 'perf_lines.send_failed');
    }
    probe.reset();
  };
}
