import { afterEach, describe, expect, it } from 'vitest';
import { hexToBytes } from '@smarteverything/ble';
import { identityOf, long, sonicareRig, word, type SonicareRig } from '../../support/sonicare-rig';

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

interface RecordFields {
  readonly clock: number;
  readonly id: number;
  readonly durationS: number;
  readonly routineS: number;
  readonly mode: number;
  readonly intensity: number;
  readonly routineId?: number;
}

function recordHex(fields: RecordFields): string {
  const tail = fields.routineId === undefined ? '' : fields.routineId.toString(16).padStart(2, '0');
  return `00${long(fields.clock)}${word(fields.id)}${word(fields.durationS)}${word(fields.routineS)}${fields.mode.toString(16).padStart(2, '0')}${fields.intensity.toString(16).padStart(2, '0')}${tail}0000`;
}

function transfer(
  brushed: SonicareRig,
  hex: string,
  id: number,
  seconds: number,
): ReturnType<SonicareRig['batch']> {
  return brushed.batch(seconds, [
    brushed.frame('40e0', `${word(id)}0f000000aaaa`, seconds),
    brushed.frame('4100', hex, seconds),
    brushed.frame('4110', '00', seconds),
  ]);
}

describe('a Prestige handle with a clock that counts from zero', () => {
  const prestige = identityOf({
    model: 'HX999X',
    bonded: true,
    routineIds: [0],
    clockIsUnix: false,
  });

  it('asks for the newest sessions it has not stored and stores each record at the time it started', async () => {
    rig = await sonicareRig(prestige);
    const first = rig.batch(0, [
      rig.frame('4050', long(453_826), 0),
      rig.frame('40d0', word(336), 0),
      rig.frame('4022', '00', 0),
      rig.frame('4010', '01', 0),
    ]);
    expect(first.fetch.map((entry) => entry.sessionId)).toStrictEqual([
      336, 335, 334, 333, 332, 331,
    ]);
    expect(first.transfer).toMatchObject({
      deadlineMs: 6000,
      cancel: { kind: 'write', hex: '02' },
    });
    transfer(
      rig,
      recordHex({
        clock: 453_226,
        id: 335,
        durationS: 160,
        routineS: 160,
        mode: 0,
        intensity: 0,
        routineId: 1,
      }),
      335,
      1,
    );
    const [session] = rig.test.store.brushingSessions.all(rig.device.id, undefined);
    expect(session).toMatchObject({
      handleSessionId: 335,
      startedAt: '2026-10-18T09:50:00.000Z',
      durationS: 160,
      routineS: 160,
      mode: 'white_plus',
      intensity: 'low',
      complete: true,
      source: 'retained',
    });
    expect(rig.events.filter((event) => event.kind === 'activity')).toHaveLength(1);
  });

  it('does not ask again for a session it already holds and waits for the open transfers', async () => {
    const brushed = await sonicareRig(prestige);
    rig = brushed;
    brushed.batch(0, [
      brushed.frame('4050', long(453_826), 0),
      brushed.frame('40d0', word(336), 0),
    ]);
    const again = brushed.batch(1, [brushed.frame('4090', word(0), 1)]);
    expect(again.fetch).toStrictEqual([]);
    const results = [336, 335, 334, 333, 332, 331].map((id) =>
      transfer(
        brushed,
        recordHex({
          clock: 400_000 + id * 100,
          id,
          durationS: 100,
          routineS: 120,
          mode: 0,
          intensity: 1,
          routineId: 0,
        }),
        id,
        2,
      ),
    );
    expect(results.slice(0, 5).every((result) => result.fetch.length === 0)).toBe(true);
    expect(results[5]?.fetch.map((entry) => entry.sessionId)).toStrictEqual([
      330, 329, 328, 327, 326, 325,
    ]);
    expect(brushed.batch(3, [brushed.frame('4090', word(0), 3)]).fetch).toStrictEqual([]);
  });

  it('refuses to fetch while the brush is in use', async () => {
    rig = await sonicareRig(prestige);
    const busy = rig.batch(0, [
      rig.frame('4050', long(453_826), 0),
      rig.frame('40d0', word(336), 0),
      rig.frame('4010', '02', 0),
      rig.frame('4082', '01', 0),
      rig.frame('4090', word(5), 0),
    ]);
    expect(busy.fetch).toStrictEqual([]);
  });

  it('forgets an unfinished transfer when the link drops and cancels it on the next plan', async () => {
    rig = await sonicareRig(prestige);
    rig.batch(0, [rig.frame('4050', long(453_826), 0), rig.frame('40d0', word(336), 0)]);
    rig.batch(1, [rig.frame('40e0', `${word(336)}0f000000aaaa`, 1)]);
    rig.batch(2, [], 'asleep');
    expect(rig.fleet.of(rig.row()).transferDropped).toBe(true);
    rig.batch(3, [], 'linked');
    expect(rig.fleet.of(rig.row()).transferDropped).toBe(false);
  });
});

describe('a handle whose live session was already stored', () => {
  it('merges the handle record into the observed session and keeps the pressure', async () => {
    rig = await sonicareRig();
    const wakeUnix = Date.parse(rig.at(10)) / 1000;
    rig.batch(0, [
      rig.frame('4022', '00010204', 0),
      rig.frame('4080', '01', 0),
      rig.frame('40b0', '01', 0),
      rig.frame('4091', word(120), 0),
      rig.frame('4070', word(485), 0),
      rig.frame('4010', '01', 0),
      rig.frame('4082', '00', 0),
      rig.frame('4090', word(0), 0),
      rig.frame('4050', long(wakeUnix + 200), 0),
    ]);
    rig.batch(10, [
      rig.frame('4010', '02', 10),
      rig.frame('4082', '01', 10),
      rig.frame('4090', word(0), 10),
    ]);
    for (let second = 11; second <= 70; second += 1) {
      rig.batch(second, [
        rig.frame('4090', word(second - 10), second),
        rig.frame('4130', '0100010001', second),
      ]);
    }
    rig.batch(71, [rig.frame('4082', '03', 71), rig.frame('4010', '01', 71)]);
    expect(rig.test.store.brushingSessions.all(rig.device.id, undefined)).toHaveLength(1);
    rig.batch(80, [rig.frame('40d0', word(485), 80), rig.frame('4050', long(wakeUnix + 300), 80)]);
    transfer(
      rig,
      recordHex({ clock: wakeUnix, id: 485, durationS: 60, routineS: 120, mode: 1, intensity: 1 }),
      485,
      81,
    );
    const sessions = rig.test.store.brushingSessions.all(rig.device.id, undefined);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      source: 'retained',
      handleSessionId: 485,
      durationS: 60,
      mode: 'white_plus',
    });
    expect(sessions[0]?.pressure?.strip.length).toBe(60);
    expect(rig.events.filter((event) => event.kind === 'activity')).toHaveLength(1);
    expect(hexToBytes('00').length).toBe(1);
  });
});
