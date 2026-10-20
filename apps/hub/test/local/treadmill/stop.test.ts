import { FTMS_MACHINE_STATUS } from '@smarteverything/ble';
import {
  CAPABILITY_KEY,
  type TreadmillActionResult,
  type TreadmillWriteStep,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTreadmillCommand, type CommandDeps } from '../../../src/local/treadmill/commands';
import { NoStepsGuard } from '../../../src/local/treadmill/guard';
import { BELT_KEPT_PAUSED, BELT_STOPPED, STOP_SETTLE_MS } from '../../../src/local/treadmill/stop';
import { feed, g15Rig, walk } from '../../support/g15-walk';
import { captureLogs, testLogger } from '../../support/logs';
import type { TreadmillRig } from '../../support/treadmill-rig';

const FTMS_STOP = '0801';
const FTMS_PAUSE = '0802';
const STATUS_PAUSED = '0202';
const STATUS_STOPPED = '0201';

interface G15Belt {
  readonly honoursPause: boolean;
  readonly honoursStopWhenPaused: boolean;
}

let rig: TreadmillRig;
let written: string[];
let second: number;

function g15Answers(belt: G15Belt): (hex: string) => string | null {
  return (hex) => {
    const state = rig.fleet.of(rig.row()).runtime.machine.state;
    if (hex === FTMS_PAUSE && belt.honoursPause) {
      return STATUS_PAUSED;
    }
    return hex === FTMS_STOP && state === 'paused' && belt.honoursStopWhenPaused
      ? STATUS_STOPPED
      : null;
  };
}

function depsFor(belt: G15Belt): CommandDeps {
  const answer = g15Answers(belt);
  return {
    store: rig.test.store,
    fleet: rig.fleet,
    broker: {
      run: (_target, steps: readonly TreadmillWriteStep[]): Promise<TreadmillActionResult> => {
        for (const step of steps) {
          written.push(step.hex);
          const status = answer(step.hex);
          second += 1;
          feed(
            rig,
            second,
            status === null ? [] : [{ characteristic: FTMS_MACHINE_STATUS, hex: status }],
          );
        }
        return Promise.resolve({ ok: true, detail: 'Done.' });
      },
    },
    guard: new NoStepsGuard(),
    holderOf: (): string | null => rig.holder.clientId,
    walkerOf: (): string => rig.owner.profile.id,
    holderName: (): string => 'Owner phone',
    now: rig.clock.now,
    log: testLogger('treadmill'),
  };
}

function stop(deps: CommandDeps): Promise<unknown> {
  const device = rig.row();
  const [row] = rig.test.store.commands.insert([
    {
      deviceId: device.id,
      capability: 'belt_command',
      value: 'stop',
      source: 'app',
      requestedBy: rig.owner.client.id,
    },
  ]);
  if (row === undefined) {
    throw new Error('the command was not stored');
  }
  return runTreadmillCommand(deps, {
    commandId: row.id,
    externalId: device.external_id,
    capability: CAPABILITY_KEY.parse(row.capability),
    value: 'stop',
  });
}

function walking(): void {
  feed(rig, 1, [{ characteristic: FTMS_MACHINE_STATUS, hex: '04' }]);
  walk(rig, 5, { kmh: 4.5, incline: 0 }, 2);
  second = 7;
  expect(rig.fleet.of(rig.row()).runtime.machine.state).toBe('running');
}

beforeEach(async () => {
  captureLogs();
  rig = await g15Rig();
  written = [];
  second = 0;
});

afterEach(async () => {
  vi.useRealTimers();
  await rig.close();
});

describe('stopping a walking G15', () => {
  it('pauses the belt first, because the G15 ignores the FTMS stop while the belt runs, then ends the walk', async () => {
    walking();
    await expect(stop(depsFor({ honoursPause: true, honoursStopWhenPaused: true }))).resolves.toBe(
      BELT_STOPPED,
    );
    expect(written).toEqual([FTMS_PAUSE, FTMS_STOP]);
    expect(rig.fleet.of(rig.row()).runtime.machine.state).toBe('stopped');
  });

  it('says the belt is paused when the treadmill keeps the walk open after the stop', async () => {
    walking();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const result = stop(depsFor({ honoursPause: true, honoursStopWhenPaused: false }));
    await vi.advanceTimersByTimeAsync(STOP_SETTLE_MS);
    await expect(result).resolves.toBe(BELT_KEPT_PAUSED);
    expect(written).toEqual([FTMS_PAUSE, FTMS_STOP]);
    expect(rig.fleet.of(rig.row()).runtime.machine.state).toBe('paused');
  });

  it('fails the command instead of reporting done when the belt keeps running', async () => {
    walking();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const result = stop(depsFor({ honoursPause: false, honoursStopWhenPaused: false }));
    const failed = expect(result).rejects.toThrow('The belt did not stop');
    await vi.advanceTimersByTimeAsync(STOP_SETTLE_MS);
    await failed;
    expect(written).toEqual([FTMS_PAUSE]);
  });
});

describe('stopping a G15 that is not walking', () => {
  it('sends only the FTMS stop to a paused belt', async () => {
    walking();
    feed(rig, 8, [{ characteristic: FTMS_MACHINE_STATUS, hex: STATUS_PAUSED }]);
    second = 8;
    await expect(stop(depsFor({ honoursPause: true, honoursStopWhenPaused: true }))).resolves.toBe(
      BELT_STOPPED,
    );
    expect(written).toEqual([FTMS_STOP]);
  });
});
