import Constants from 'expo-constants';
import { Logger } from '@smarteverything/logging';
import { Uniwind } from 'uniwind';
import { sendTrail } from '../../api/client-failures';
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
    });
    seq += 1;
    before = memory;
    lines.forEach((reason) => {
      if (upload) {
        log.warn('perf.sample', { reason });
      } else {
        log.debug('perf.sample', { reason });
      }
    });
    if (upload) {
      void sendTrail();
    }
    probe.reset();
  };
}
