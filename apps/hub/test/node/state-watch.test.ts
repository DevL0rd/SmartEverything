import type { ComputerScope, StateParts, SystemState } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComputerControls } from '../../src/node/controls/controls';
import { StateWatch } from '../../src/node/state-watch';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { stubControls } from '../support/paired-computer';
import { unusedControls } from './controls/unused-controls';

const SYSTEM: SystemState = {
  battery: null,
  powerMode: null,
  dnd: false,
  keyboard: null,
  wifi: null,
  bluetooth: null,
  usb: [],
};

interface Watching {
  readonly watch: StateWatch;
  readonly emitted: StateParts[];
  readonly logs: CapturedLogs;
}

function watching(read: () => Promise<SystemState>, allowed: ReadonlySet<ComputerScope>): Watching {
  const emitted: StateParts[] = [];
  const logs = captureLogs();
  const { system } = unusedControls();
  const controls: ComputerControls = stubControls({
    system: { ...system, settings: { ...system.settings, state: read } },
  });
  const watch = new StateWatch({
    controls,
    allows: (scope): boolean => allowed.has(scope),
    emit: (parts): void => {
      emitted.push(parts);
    },
    log: testLogger('node'),
  });
  return { watch, emitted, logs };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('node state watch', () => {
  it('reads a one-shot topic when it is demanded and not again while the demand stays', async () => {
    const read = vi.fn(() => Promise.resolve(SYSTEM));
    const { watch, emitted } = watching(read, new Set(['system']));
    watch.sync({ system: 1000 });
    watch.sync({ system: 1000 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([{ system: SYSTEM }]);
    watch.stop();
  });

  it('retries a failed read with growing waits and logs the failure once', async () => {
    let failures = 3;
    const read = vi.fn(() =>
      failures-- > 0 ? Promise.reject(new Error('dbus busy')) : Promise.resolve(SYSTEM),
    );
    const { watch, emitted, logs } = watching(read, new Set(['system']));
    watch.sync({ system: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(read).toHaveBeenCalledTimes(4);
    expect(emitted).toEqual([{ system: SYSTEM }]);
    expect(logs.events().filter((event) => event === 'node.state_read_failed')).toHaveLength(1);
    watch.stop();
  });

  it('stops retrying when the topic is no longer demanded', async () => {
    const read = vi.fn(() => Promise.reject(new Error('dbus busy')));
    const { watch } = watching(read, new Set(['system']));
    watch.sync({ system: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    watch.sync({});
    await vi.advanceTimersByTimeAsync(120_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('leaves a topic alone while its permission is off', async () => {
    const read = vi.fn(() => Promise.resolve(SYSTEM));
    const { watch } = watching(read, new Set());
    watch.sync({ system: 1000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).not.toHaveBeenCalled();
  });
});
