import { BRUSHING_SESSION, type BrushingSession } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { identityOf, sonicareRig, type SonicareRig } from '../../support/sonicare-rig';

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

function session(
  rigged: SonicareRig,
  id: string,
  startedAt: string,
  values: Partial<BrushingSession> = {},
): BrushingSession {
  return BRUSHING_SESSION.parse({
    id,
    deviceId: rigged.device.id,
    personId: rigged.owner.profile.id,
    handleSessionId: null,
    startedAt,
    zoneOffsetSeconds: 0,
    durationS: 120,
    routineS: 120,
    mode: 'clean',
    intensity: 'medium',
    source: 'observed',
    complete: true,
    pressure: { excessS: 1, optimalS: 2, strip: [0, 1, 2] },
    zones: [20, 20, 20, 20, 20, 20],
    headSerial: 'AA',
    ...values,
  });
}

describe('the brushing sessions table', () => {
  it('stores a session whole and finds it by its handle id and by its start', async () => {
    rig = await sonicareRig(identityOf());
    const { brushingSessions } = rig.test.store;
    const stored = session(rig, 'a', '2026-10-18T07:00:00.000Z', {
      handleSessionId: 7,
      source: 'retained',
    });
    brushingSessions.add(stored);
    expect(brushingSessions.byId('a')).toStrictEqual(stored);
    expect(brushingSessions.findByHandleId(rig.device.id, 7)?.id).toBe('a');
    expect(brushingSessions.near(rig.device.id, '2026-10-18T07:00:03.000Z', 5)?.id).toBe('a');
    expect(brushingSessions.near(rig.device.id, '2026-10-18T07:00:09.000Z', 5)).toBeUndefined();
    expect(brushingSessions.handleIds(rig.device.id)).toStrictEqual([7]);
  });

  it('stores the details and pressure extras of an Oral-B session and reads a plain one as having none', async () => {
    rig = await sonicareRig(identityOf());
    const { brushingSessions } = rig.test.store;
    const plain = session(rig, 'plain', '2026-10-18T07:00:00.000Z');
    const detailed = session(rig, 'detailed', '2026-10-18T21:00:00.000Z', {
      mode: 'daily_clean',
      intensity: null,
      pressure: {
        excessS: 1,
        optimalS: 2,
        strip: [0, 1, 2],
        lowS: 3,
        forceAvgN: 1.5,
        forceMaxN: 3,
      },
      zones: [30, 30, 30, 30],
      details: { zoneSource: 'pacer', face: 7, batteryEnd: 81, handleUser: 2, sectors: 4 },
    });
    brushingSessions.add(plain);
    brushingSessions.add(detailed);
    expect(brushingSessions.byId('plain').details).toBeNull();
    expect(brushingSessions.byId('detailed')).toStrictEqual(detailed);
    brushingSessions.update({ ...detailed, details: null });
    expect(brushingSessions.byId('detailed').details).toBeNull();
  });

  it('updates, reassigns and forgets a session', async () => {
    rig = await sonicareRig(identityOf());
    const { brushingSessions } = rig.test.store;
    brushingSessions.add(session(rig, 'a', '2026-10-18T07:00:00.000Z'));
    brushingSessions.update(
      session(rig, 'a', '2026-10-18T07:00:00.000Z', { durationS: 60, pressure: null }),
    );
    expect(brushingSessions.byId('a')).toMatchObject({ durationS: 60, pressure: null });
    brushingSessions.reassign('a', null);
    expect(brushingSessions.byId('a').personId).toBeNull();
    brushingSessions.remove('a');
    expect(brushingSessions.find('a')).toBeUndefined();
    expect(() => brushingSessions.byId('a')).toThrow();
  });

  it('pages newest first and filters by person', async () => {
    rig = await sonicareRig(identityOf());
    const { brushingSessions } = rig.test.store;
    brushingSessions.add(session(rig, 'a', '2026-10-18T07:00:00.000Z'));
    brushingSessions.add(
      session(rig, 'b', '2026-10-18T21:00:00.000Z', { personId: rig.member.profile.id }),
    );
    brushingSessions.add(session(rig, 'c', '2026-10-19T07:00:00.000Z', { personId: null }));
    const page = (personId: string | null | undefined, before?: string): string[] =>
      brushingSessions
        .page({ deviceId: rig!.device.id, personId, before, limit: 10 })
        .map((item) => item.id);
    expect(page(undefined)).toStrictEqual(['c', 'b', 'a']);
    expect(page(rig.owner.profile.id)).toStrictEqual(['a']);
    expect(page(null)).toStrictEqual(['c']);
    expect(page(undefined, '2026-10-18T21:00:00.000Z')).toStrictEqual(['a']);
    expect(
      brushingSessions.all(rig.device.id, rig.member.profile.id).map((item) => item.id),
    ).toStrictEqual(['b']);
    expect(brushingSessions.countHidden(rig.device.id, rig.member.profile.id)).toBe(2);
  });

  it('keeps one row per head and moves its usage on', async () => {
    rig = await sonicareRig(identityOf());
    const { brushingSessions } = rig.test.store;
    brushingSessions.saveHead(rig.device.id, {
      serial: 'AA',
      type: 'clean',
      at: '2026-09-18T00:00:00.000Z',
      usageS: 100,
      limitS: 21600,
    });
    brushingSessions.saveHead(rig.device.id, {
      serial: 'AA',
      type: null,
      at: '2026-10-18T00:00:00.000Z',
      usageS: 4000,
      limitS: 21600,
    });
    brushingSessions.saveHead(rig.device.id, {
      serial: 'BB',
      type: 'white',
      at: '2026-10-18T00:00:00.000Z',
      usageS: 0,
      limitS: 21600,
    });
    expect(brushingSessions.heads(rig.device.id)).toMatchObject([
      {
        serial: 'AA',
        type: 'clean',
        firstSeen: '2026-09-18T00:00:00.000Z',
        lastSeen: '2026-10-18T00:00:00.000Z',
        firstUsageS: 100,
        usageS: 4000,
      },
      { serial: 'BB', type: 'white' },
    ]);
  });

  it('forgets its sessions and heads when the device goes', async () => {
    rig = await sonicareRig(identityOf());
    const { brushingSessions, devices } = rig.test.store;
    brushingSessions.add(session(rig, 'a', '2026-10-18T07:00:00.000Z'));
    brushingSessions.saveHead(rig.device.id, {
      serial: 'AA',
      type: null,
      at: '2026-10-18T00:00:00.000Z',
      usageS: 1,
      limitS: 2,
    });
    devices.remove([rig.device.id]);
    expect(brushingSessions.all(rig.device.id, undefined)).toStrictEqual([]);
    expect(brushingSessions.heads(rig.device.id)).toStrictEqual([]);
  });
});
