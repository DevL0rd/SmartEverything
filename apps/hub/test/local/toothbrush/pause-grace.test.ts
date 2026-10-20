import { ORALB_RULES, SONICARE_RULES } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import type { BrushSnapshot } from '../../../src/local/toothbrush/brand';
import { sonicareBrand } from '../../../src/local/sonicare/brand';
import { SessionMachine, type MachineEvent } from '../../../src/local/toothbrush/session-machine';
import {
  identityOf,
  lastState,
  sonicareRig,
  word,
  type SonicareRig,
} from '../../support/sonicare-rig';

const GRACE_BRAND = { ...sonicareBrand, rules: ORALB_RULES };

const START = Date.parse('2026-10-18T10:00:00.000Z');

function snapshot(values: Partial<BrushSnapshot>): BrushSnapshot {
  return {
    activity: 'standby',
    elapsedS: 0,
    routineS: 120,
    mode: 'daily_clean',
    intensity: null,
    pressure: null,
    pressureValue: null,
    temperatureC: null,
    zone: null,
    zoneSeconds: [],
    sectorS: null,
    force: null,
    angleDeg: null,
    face: null,
    battery: 80,
    batteryMillivolts: null,
    sessionId: null,
    head: { serial: null, type: null, usageS: null, limitS: null },
    endHint: null,
    faults: null,
    liveSource: null,
    ...values,
  };
}

function tick(
  seconds: number,
  values: Partial<BrushSnapshot>,
  elapsedChanged = true,
): Parameters<SessionMachine['step']>[0] {
  return {
    at: new Date(START + seconds * 1000).toISOString(),
    snapshot: snapshot(values),
    pressure: null,
    elapsedChanged,
  };
}

function kinds(events: readonly MachineEvent[]): string[] {
  return events.map((event) => event.kind);
}

function brushed(machine: SessionMachine, until: number): void {
  for (let second = 0; second <= until; second += 1) {
    machine.step(tick(second, { activity: 'brushing', elapsedS: second, mode: 'daily_clean' }));
  }
}

describe('a handle without a pause grace', () => {
  it('finishes the moment brushing stops', () => {
    const machine = new SessionMachine(SONICARE_RULES, false);
    brushed(machine, 30);
    const events = machine.step(tick(31, { activity: 'standby', elapsedS: 30 }, false));
    expect(kinds(events)).toStrictEqual(['finished']);
    expect(machine.deadlineMs).toBeNull();
  });
});

describe('a handle with a twenty second pause grace', () => {
  it('opens a provisional end on a stop and carries on when brushing resumes inside the grace', () => {
    const machine = new SessionMachine(ORALB_RULES, true);
    brushed(machine, 30);
    const stopped = machine.step(tick(31, { activity: 'standby', elapsedS: 30 }, false));
    expect(kinds(stopped)).toStrictEqual(['paused']);
    expect(machine.deadlineMs).toBe(START + 31_000 + 20_000);
    expect(machine.isOpen).toBe(true);
    const resumed = machine.step(tick(40, { activity: 'brushing', elapsedS: 31 }));
    expect(kinds(resumed)).toStrictEqual(['resumed']);
    expect(machine.deadlineMs).toBeNull();
  });

  it('closes at the stop time when the next frame comes after the grace', () => {
    const machine = new SessionMachine(ORALB_RULES, true);
    brushed(machine, 30);
    machine.step(tick(31, { activity: 'standby', elapsedS: 30 }, false));
    const events = machine.step(tick(60, { activity: 'standby', elapsedS: 30 }, false));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'finished',
      at: new Date(START + 31_000).toISOString(),
      stoppedEarly: true,
      session: { durationS: 30, details: { zoneSource: 'pacer' } },
    });
    expect(machine.isOpen).toBe(false);
  });

  it('starts a new session when the frame after the grace is brushing again', () => {
    const machine = new SessionMachine(ORALB_RULES, true);
    brushed(machine, 30);
    machine.step(tick(31, { activity: 'standby', elapsedS: 30 }, false));
    const events = machine.step(tick(60, { activity: 'brushing', elapsedS: 0 }));
    expect(kinds(events)).toStrictEqual(['finished', 'started']);
    expect(machine.isOpen).toBe(true);
  });

  it('closes at once on a summary, charging or sleep', () => {
    for (const closing of [
      { endHint: 'complete' as const },
      { activity: 'charging' as const },
      { activity: 'asleep' as const },
    ]) {
      const machine = new SessionMachine(ORALB_RULES, true);
      brushed(machine, 30);
      machine.step(tick(31, { activity: 'standby', elapsedS: 30 }, false));
      const events = machine.step(
        tick(35, { activity: 'standby', elapsedS: 30, ...closing }, false),
      );
      expect(kinds(events)).toStrictEqual(['finished']);
      expect(machine.deadlineMs).toBeNull();
    }
  });

  it('closes on the deadline when nothing arrives and not before', () => {
    const machine = new SessionMachine(ORALB_RULES, true);
    brushed(machine, 30);
    machine.step(tick(31, { activity: 'standby', elapsedS: 30 }, false));
    expect(machine.expire(new Date(START + 50_000).toISOString())).toStrictEqual([]);
    const events = machine.expire(new Date(START + 51_000).toISOString());
    expect(kinds(events)).toStrictEqual(['finished']);
    expect(machine.isOpen).toBe(false);
    expect(machine.expire(new Date(START + 99_000).toISOString())).toStrictEqual([]);
  });

  it('records the sectors, the face and the force of a handle that times its zones', () => {
    const machine = new SessionMachine(ORALB_RULES, true);
    for (let second = 0; second <= 30; second += 1) {
      machine.step({
        ...tick(second, {
          activity: 'brushing',
          elapsedS: second,
          force: 2,
          zoneSeconds: [10, 10, 10, 0],
          face: 3,
        }),
        pressure: second % 10 < 3 ? 'too_high' : 'optimal',
      });
    }
    const events = machine.step(
      tick(
        31,
        {
          activity: 'standby',
          elapsedS: 30,
          endHint: 'complete',
          face: 3,
          zoneSeconds: [10, 10, 10, 0],
        },
        false,
      ),
    );
    expect(events[0]).toMatchObject({
      kind: 'finished',
      session: {
        zones: [10, 10, 10, 0],
        details: { zoneSource: 'pacer', face: 3, sectors: 4, batteryEnd: 80 },
        pressure: { forceAvgN: 2, forceMaxN: 2, highEvents: 3 },
      },
    });
  });
});

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

describe('the deadline on the hub clock', () => {
  it('closes a session whose stop was never followed by a frame', async () => {
    const brushed = await sonicareRig(identityOf(), {}, 'owner', GRACE_BRAND);
    rig = brushed;
    brushed.batch(0, [
      brushed.frame('4022', '00010204', 0),
      brushed.frame('4080', '01', 0),
      brushed.frame('4091', word(120), 0),
    ]);
    brushed.batch(10, [
      brushed.frame('4010', '02', 10),
      brushed.frame('4082', '01', 10),
      brushed.frame('4090', word(0), 10),
    ]);
    for (let second = 11; second <= 40; second += 1) {
      brushed.batch(second, [brushed.frame('4090', word(second - 10), second)]);
    }
    brushed.batch(41, [brushed.frame('4082', '00', 41)]);
    expect(lastState(brushed, 'brush_session')).toBe('paused');
    expect(brushed.clock.pending()).toStrictEqual([brushed.at(61)]);
    expect(brushed.test.store.brushingSessions.all(brushed.device.id, undefined)).toHaveLength(0);
    brushed.clock.advanceTo(brushed.at(70));
    expect(lastState(brushed, 'brush_session')).toBe('stopped_early');
    expect(brushed.clock.pending()).toStrictEqual([]);
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({ durationS: 30, startedAt: brushed.at(10) });
  });

  it('cancels the deadline when brushing goes on', async () => {
    const brushed = await sonicareRig(identityOf(), {}, 'owner', GRACE_BRAND);
    rig = brushed;
    brushed.batch(0, [
      brushed.frame('4022', '00010204', 0),
      brushed.frame('4080', '01', 0),
      brushed.frame('4091', word(120), 0),
    ]);
    brushed.batch(10, [
      brushed.frame('4010', '02', 10),
      brushed.frame('4082', '01', 10),
      brushed.frame('4090', word(0), 10),
    ]);
    brushed.batch(30, [brushed.frame('4090', word(20), 30)]);
    brushed.batch(41, [brushed.frame('4090', word(31), 41), brushed.frame('4082', '00', 41)]);
    expect(brushed.clock.pending()).toStrictEqual([brushed.at(61)]);
    brushed.batch(50, [brushed.frame('4082', '01', 50), brushed.frame('4090', word(32), 50)]);
    expect(brushed.clock.pending()).toStrictEqual([brushed.at(80)]);
    expect(lastState(brushed, 'brush_session')).toBe('running');
  });
});
