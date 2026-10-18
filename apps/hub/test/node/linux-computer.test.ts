import { NODE_HELLO, SAMPLE_PARTS, SAMPLE_TOPICS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { LinuxComputer } from '../../src/node/collectors/linux/linux-computer';
import type { Tick } from '../../src/node/collectors/tick';
import { captureLogs, testLogger } from '../support/logs';

const SETTLE_MS = 1100;

function everything(computer: LinuxComputer, tick: Tick): unknown {
  const parts: Record<string, unknown> = {};
  for (const topic of SAMPLE_TOPICS) {
    if (topic !== 'processes') {
      parts[topic] = computer.readers[topic](tick) ?? undefined;
    }
  }
  return parts;
}

describe.skipIf(process.platform !== 'linux')('LinuxComputer on this machine', () => {
  it('says hello with what it can read and reads every topic in the shape of the contract', async () => {
    captureLogs();
    const computer = new LinuxComputer(testLogger('node'));
    try {
      const hello = NODE_HELLO.parse(computer.hello(new Date()));
      expect(hello.features).toEqual(expect.arrayContaining(['cpu', 'memory', 'disks', 'network']));
      everything(computer, { at: Date.now(), key: true });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      const parts = SAMPLE_PARTS.parse(everything(computer, { at: Date.now(), key: false }));
      expect(parts.summary?.processCount).toBeGreaterThan(10);
      expect(parts.cpu?.cores).toHaveLength(hello.cpu.threads);
      expect(parts.memory?.totalBytes).toBeGreaterThan(0);
      expect(parts.disks?.disks.length).toBeGreaterThan(0);
    } finally {
      computer.stop();
    }
  });

  it('reads the same counters once for every topic of a tick', () => {
    captureLogs();
    const computer = new LinuxComputer(testLogger('node'));
    try {
      const tick = { at: Date.now(), key: false };
      const first = computer.readers.summary(tick);
      const again = computer.readers.summary(tick);
      expect(again).toEqual(first);
    } finally {
      computer.stop();
    }
  });
});
