import {
  isAllowedRequest,
  requestIdOf,
  requestNameOfFrame,
  hexToBytes,
} from '@smarteverything/ble';
import type { BottleSyncPlan } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryConfigOf, saveConfig } from '../../../src/local/bottle/config';
import { planDepsOf } from '../../../src/local/bottle/ingest';
import { actionPlanOf, syncPlanOf } from '../../../src/local/bottle/plan';
import { captureLogs } from '../../support/logs';
import { bottleRig, tofRow, type BottleRig } from '../../support/bottle-rig';

let rig: BottleRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
});

afterEach(async () => {
  await rig.close();
});

function plan(): BottleSyncPlan {
  return syncPlanOf(planDepsOf(rig.ingestDeps), { entry: rig.entry(), deviceId: rig.device.id });
}

function names(): string[] {
  return plan().steps.map((step) => step.name);
}

describe('what to ask a cap that has never been read', () => {
  it('reads who it is, its battery and clock, sets the clock, then its state, settings and every log', () => {
    expect(names()).toStrictEqual([
      'device_information',
      'battery',
      'time',
      'set_time',
      'ui_state',
      'reminder',
      'quiet',
      'tof_settings',
      'low_battery',
      'uv_config',
      'thresholds',
      'protection',
      'calibration_timeout',
      'log_tof',
      'log_activation',
      'log_state',
      'log_fault',
      'log_activation_adc',
      'log_charging_adc',
    ]);
  });

  it('numbers its requests apart from the ones the phone makes and only asks what is allowed', () => {
    const requests = plan().steps.flatMap((step) => (step.kind === 'request' ? [step] : []));
    const ids = requests.map((step) => requestIdOf(hexToBytes(step.requestHex)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBeLessThan(1000);
    for (const step of requests) {
      expect(isAllowedRequest(requestNameOfFrame(hexToBytes(step.requestHex)))).toBe(true);
    }
  });

  it('pages every log from the start of history, a few rows at a time', () => {
    const logs = plan().steps.flatMap((step) => (step.kind === 'log' ? [step] : []));
    expect(logs.every((step) => step.fromTimestamp === 0 && step.limit <= 8)).toBe(true);
    expect(logs.find((step) => step.log === 'tof')?.limit).toBe(5);
  });
});

describe('what to ask a cap that was read a moment ago', () => {
  beforeEach(async () => {
    rig.cap.tof.rows.push(tofRow(rig.seconds(-30), 54));
    await rig.sync();
  });

  it('skips the identity, the settings and the daily logs and asks the live logs from where it stopped', () => {
    expect(names()).toStrictEqual([
      'battery',
      'time',
      'set_time',
      'ui_state',
      'log_tof',
      'log_activation',
      'log_fault',
    ]);
    const tof = plan().steps.find((step) => step.name === 'log_tof');
    expect(tof).toMatchObject({ fromTimestamp: rig.seconds(-30) });
  });

  it('asks again for the settings and the daily logs a day later', () => {
    rig.clock.advanceTo('2026-10-19T13:00:00.000Z');
    expect(names()).toContain('reminder');
    expect(names()).toContain('log_state');
  });

  it('writes a waiting setting, reads it back, and follows an automatic quiet window', async () => {
    await rig.act(rig.owner, {
      action: 'set_reminder',
      reminder: { state: 'interval_fixed', intervalMin: 30, from: '08:00', to: '21:00' },
    });
    expect(names().slice(2, 6)).toStrictEqual(['set_time', 'ui_state', 'set_reminder', 'reminder']);
    saveConfig(rig.test.store, rig.entry(), {
      ...entryConfigOf(rig.entry()),
      desired: { reminder: null, quiet: { state: 'auto' } },
    });
    expect(names()).toContain('set_quiet');
  });

  it('leaves out a request this firmware does not answer', () => {
    saveConfig(rig.test.store, rig.entry(), {
      ...entryConfigOf(rig.entry()),
      unsupported: { firmware: '2.3.1', requests: ['log_fault', 'ui_state'] },
    });
    expect(names()).not.toContain('log_fault');
    expect(names()).not.toContain('ui_state');
  });
});

describe('what to ask for one action', () => {
  const target = (): { entry: ReturnType<BottleRig['entry']>; deviceId: string } => ({
    entry: rig.entry(),
    deviceId: rig.device.id,
  });

  it('measures only after the cap says it is upright and still, then reads the new level', () => {
    const steps = actionPlanOf(planDepsOf(rig.ingestDeps), target(), 'measure', null).steps;
    expect(steps.map((step) => step.name)).toStrictEqual(['accelerometer', 'tof_state', 'log_tof']);
    expect(steps[0]).toMatchObject({ kind: 'request', gate: { kind: 'upright_still' } });
    expect(steps[1]).toMatchObject({ kind: 'request', gate: null });
  });

  it('reads the four sensors one request each, and the orientation alone', () => {
    const deps = planDepsOf(rig.ingestDeps);
    expect(
      actionPlanOf(deps, target(), 'read_sensors', null).steps.map((s) => s.name),
    ).toStrictEqual(['ambient', 'hall', 'sip', 'seated']);
    expect(
      actionPlanOf(deps, target(), 'read_orientation', null).steps.map((s) => s.name),
    ).toStrictEqual(['accelerometer']);
  });

  it('stops or starts a clean with the mode written out, then reads the state', () => {
    const deps = planDepsOf(rig.ingestDeps);
    const stop = actionPlanOf(deps, target(), 'uv_stop', null).steps[0];
    const start = actionPlanOf(deps, target(), 'uv_start', 'adventure').steps[0];
    expect(stop).toMatchObject({ kind: 'request', name: 'uv' });
    expect(stop?.kind === 'request' && stop.requestHex.endsWith('12020803')).toBe(true);
    expect(start?.kind === 'request' && start.requestHex.endsWith('12020802')).toBe(true);
    expect(actionPlanOf(deps, target(), 'uv_start', null).steps[0]).toMatchObject({ name: 'uv' });
  });

  it('syncs with the ordinary plan', () => {
    expect(
      actionPlanOf(planDepsOf(rig.ingestDeps), target(), 'sync_now', null).steps.map((s) => s.name),
    ).toStrictEqual(names());
  });
});
