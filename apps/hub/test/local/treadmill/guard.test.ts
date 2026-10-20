import type { TreadmillFrame } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { inclineBlock, inclineCaller } from '../../../src/local/treadmill/incline-guard';
import { NoStepsGuard } from '../../../src/local/treadmill/guard';
import { captureLogs } from '../../support/logs';
import {
  COUNTDOWN,
  FTMS_GATT,
  RUNNING,
  statusHex,
  treadmillRig,
  type TreadmillRig,
} from '../../support/treadmill-rig';

let rig: TreadmillRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const MINUTE_MS = 60_000;

describe('stopping a remote start when nobody steps on', () => {
  it('stops a belt that reports steps and none arrive', async () => {
    captureLogs();
    rig = await treadmillRig();
    const guard = new NoStepsGuard();
    guard.arm(rig.row().id, rig.clock.now().getTime());
    rig.batch(1, [statusHex({ state: COUNTDOWN })]);
    rig.batch(2, [statusHex({ state: RUNNING, speed10: 8, time: 1, steps: 0 })]);
    const later = rig.clock.now().getTime() + MINUTE_MS;
    expect(guard.expired(rig.fleet.of(rig.row()), later)).toBe(true);
  });

  it('never stops a belt that reports no step count at all', async () => {
    captureLogs();
    rig = await treadmillRig('ftms', FTMS_GATT);
    const guard = new NoStepsGuard();
    guard.arm(rig.row().id, rig.clock.now().getTime());
    rig.ingest.process(rig.row(), rig.owner.client, {
      frames: [
        { at: rig.clock.now().toISOString(), characteristic: '2ada', hex: '04' },
        { at: rig.clock.now().toISOString(), characteristic: '2acd', hex: '00002c01' },
      ],
      link: { phase: 'linked', rssi: -55, reconnects: 0, detail: null },
    });
    const state = rig.fleet.of(rig.row());
    expect(state.runtime.machine.state).toBe('running');
    const later = rig.clock.now().getTime() + MINUTE_MS;
    expect(guard.expired(state, later)).toBe(false);
    expect(guard.expired(state, later + MINUTE_MS)).toBe(false);
  });
});

describe('who is on the belt for an incline change', () => {
  const OWNER = { owner: true, walker: false, remote: false } as const;
  const SETTINGS = { weightKg: 70, gradePercent: 4, runSwitchKmh: 8 };

  function dataAt(seconds: number, steps: number): TreadmillFrame {
    const word = (value: number): string =>
      (value & 0xff).toString(16).padStart(2, '0') +
      ((value >> 8) & 0xff).toString(16).padStart(2, '0');
    return {
      at: new Date(Date.parse('2026-10-18T10:00:00.000Z') + seconds * 1000).toISOString(),
      characteristic: '2acd',
      hex: `0424${word(300)}000000${word(seconds)}${word(steps)}00`,
    };
  }

  it('sees steps for 30 seconds after the last step, only while the belt moves', async () => {
    captureLogs();
    rig = await treadmillRig('ftms', FTMS_GATT);
    const state = rig.fleet.of(rig.row());
    state.runtime.ingest([dataAt(1, 3)], SETTINGS);
    const at = (seconds: number): Date => new Date(Date.parse(dataAt(seconds, 0).at));
    expect(inclineCaller(state, OWNER, at(31)).stepsSeen).toBe(true);
    expect(inclineCaller(state, OWNER, at(32)).stepsSeen).toBe(false);
    state.runtime.ingest([{ at: dataAt(33, 0).at, characteristic: '2ada', hex: '0201' }], SETTINGS);
    expect(inclineCaller(state, OWNER, at(33)).stepsSeen).toBe(false);
  });

  it('counts a person on the holder phone as holding, and a remote caller as not', async () => {
    captureLogs();
    rig = await treadmillRig('ftms', FTMS_GATT);
    const state = rig.fleet.of(rig.row());
    expect(inclineCaller(state, OWNER, new Date()).held).toBe(true);
    expect(inclineCaller(state, { ...OWNER, remote: true }, new Date()).held).toBe(false);
  });

  it('blocks a change while the belt reports a fault', async () => {
    captureLogs();
    rig = await treadmillRig('ftms', FTMS_GATT);
    const state = rig.fleet.of(rig.row());
    expect(inclineBlock(state)).toBeNull();
    state.runtime.machine = { ...state.runtime.machine, state: 'fault' };
    expect(inclineBlock(state)).toContain('fault');
  });
});
