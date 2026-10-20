import { afterEach, describe, expect, it, vi } from 'vitest';
import { homeClock } from '../../../src/local/toothbrush/clock';
import { readBrush, type ViewDeps } from '../../../src/local/toothbrush/views';
import {
  identityOf,
  lastState,
  long,
  sonicareRig,
  word,
  type SonicareRig,
} from '../../support/sonicare-rig';

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const PRESTIGE = identityOf({
  model: 'HX999X',
  bonded: true,
  routineIds: [0],
  clockIsUnix: false,
});

function recordHex(id: number, durationS: number, clock: number): string {
  return `00${long(clock)}${word(id)}${word(durationS)}${word(160)}0001000000`;
}

function wakePrestige(brushed: SonicareRig, seconds: number): ReturnType<SonicareRig['batch']> {
  return brushed.batch(seconds, [
    brushed.frame('4050', long(453_826), seconds),
    brushed.frame('40d0', word(336), seconds),
    brushed.frame('4022', '00', seconds),
    brushed.frame('4010', '01', seconds),
  ]);
}

function transfer(
  brushed: SonicareRig,
  id: number,
  seconds: number,
  body: { readonly record: string | null; readonly status: string },
): ReturnType<SonicareRig['batch']> {
  const frames = [brushed.frame('40e0', `${word(id)}0f000000aaaa`, seconds)];
  if (body.record !== null) {
    frames.push(brushed.frame('4100', body.record, seconds));
  }
  frames.push(brushed.frame('4110', body.status, seconds));
  return brushed.batch(seconds, frames);
}

function depsOf(brushed: SonicareRig): ViewDeps {
  return {
    store: brushed.test.store,
    fleet: brushed.fleet,
    clock: homeClock(brushed.test.store),
    holder: () => null,
    series: () => ({ resolution: 'hour', points: [] }),
    now: brushed.clock.now,
  };
}

describe('events for retained sessions', () => {
  it('stores a session that ended long before the link started and stays quiet about it', async () => {
    rig = await sonicareRig(PRESTIGE);
    wakePrestige(rig, 0);
    transfer(rig, 335, 1, {
      record: recordHex(335, 160, 453_826 - 7200),
      status: '00',
    });
    expect(rig.test.store.brushingSessions.all(rig.device.id, undefined)).toHaveLength(1);
    expect(rig.events.filter((event) => event.kind === 'activity')).toHaveLength(0);
  });

  it('says a session that ended just before the link started', async () => {
    rig = await sonicareRig(PRESTIGE);
    wakePrestige(rig, 0);
    transfer(rig, 335, 1, { record: recordHex(335, 160, 453_826 - 400), status: '00' });
    expect(rig.events.filter((event) => event.kind === 'activity')).toHaveLength(1);
  });

  it('does not ask again for sessions the handle ended without a record', async () => {
    const brushed = await sonicareRig(PRESTIGE);
    rig = brushed;
    const first = wakePrestige(brushed, 0);
    expect(first.fetch.map((entry) => entry.sessionId)).toStrictEqual([
      336, 335, 334, 333, 332, 331,
    ]);
    const results = first.fetch.map((entry) =>
      transfer(brushed, entry.sessionId, 1, { record: null, status: '02' }),
    );
    expect(results.at(-1)?.fetch.map((entry) => entry.sessionId)).toStrictEqual([
      330, 329, 328, 327, 326, 325,
    ]);
    expect(brushed.test.store.brushingSessions.all(brushed.device.id, undefined)).toHaveLength(0);
  });

  it('drops a retained record under the minimum like an observed one and does not ask for it again', async () => {
    const brushed = await sonicareRig(PRESTIGE);
    rig = brushed;
    const first = wakePrestige(brushed, 0);
    const results = first.fetch.map((entry) =>
      entry.sessionId === 335
        ? transfer(brushed, 335, 1, { record: recordHex(335, 5, 453_826 - 60), status: '00' })
        : transfer(brushed, entry.sessionId, 1, { record: null, status: '02' }),
    );
    expect(brushed.test.store.brushingSessions.all(brushed.device.id, undefined)).toHaveLength(0);
    expect(brushed.events.filter((event) => event.kind === 'activity')).toHaveLength(0);
    expect(results.at(-1)?.fetch.map((entry) => entry.sessionId)).toStrictEqual([
      330, 329, 328, 327, 326, 325,
    ]);
  });
});

describe('a link that starts', () => {
  it('forgets the transfer of the previous link before it reads the frames of the new one', async () => {
    const brushed = await sonicareRig(PRESTIGE);
    rig = brushed;
    wakePrestige(brushed, 0);
    brushed.batch(1, [brushed.frame('40e0', `${word(335)}0f000000aaaa`, 1)]);
    brushed.batch(2, [], 'asleep');
    brushed.batch(3, [
      brushed.frame('4100', recordHex(335, 160, 453_826 - 60), 3),
      brushed.frame('4110', '00', 3),
    ]);
    expect(brushed.test.store.brushingSessions.all(brushed.device.id, undefined)).toHaveLength(0);
  });

  it('also starts clean when it is only connecting', async () => {
    const brushed = await sonicareRig(PRESTIGE);
    rig = brushed;
    wakePrestige(brushed, 0);
    brushed.batch(1, [brushed.frame('40e0', `${word(335)}0f000000aaaa`, 1)]);
    brushed.batch(2, [], 'asleep');
    brushed.batch(3, [], 'connecting');
    expect(brushed.fleet.of(brushed.row()).runtime.transferring).toBe(false);
  });

  it('keeps the transfer while the same link goes on', async () => {
    const brushed = await sonicareRig(PRESTIGE);
    rig = brushed;
    wakePrestige(brushed, 0);
    brushed.batch(1, [brushed.frame('40e0', `${word(335)}0f000000aaaa`, 1)]);
    expect(brushed.fleet.of(brushed.row()).runtime.transferring).toBe(true);
    brushed.batch(2, []);
    expect(brushed.fleet.of(brushed.row()).runtime.transferring).toBe(true);
  });
});

describe('the pressure shown while brushing', () => {
  it('promotes a held change on the elapsed tick when no pressure frame follows', async () => {
    const brushed = await sonicareRig();
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
    brushed.batch(11, [
      brushed.frame('4090', word(1), 11),
      brushed.frame('4130', '0100010001', 11),
    ]);
    brushed.batch(15, [
      brushed.frame('4090', word(5), 15),
      brushed.frame('4130', '0100010002', 15),
    ]);
    const shown = (): string | null => brushed.fleet.of(brushed.row()).runtime.pressureShown;
    expect(shown()).toBe('optimal');
    brushed.batch(16, [brushed.frame('4090', word(6), 16)]);
    expect(shown()).toBe('optimal');
    brushed.batch(17, [brushed.frame('4090', word(7), 17)]);
    expect(shown()).toBe('too_high');
  });
});

describe('what a state read costs', () => {
  it('reads the sessions once until a session changes', async () => {
    const brushed = await sonicareRig();
    rig = brushed;
    const viewer = {
      clientId: brushed.owner.client.id,
      role: 'owner',
      profileId: brushed.owner.profile.id,
    } as const;
    const all = vi.spyOn(brushed.test.store.brushingSessions, 'all');
    const read = (): ReturnType<typeof readBrush> =>
      readBrush(depsOf(brushed), brushed.row(), viewer, { view: 'state' });
    read();
    read();
    read();
    expect(all).toHaveBeenCalledTimes(1);
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
    brushed.batch(40, [
      brushed.frame('4090', word(30), 40),
      brushed.frame('4082', '03', 40),
      brushed.frame('4010', '01', 40),
    ]);
    all.mockClear();
    const view = read();
    read();
    expect(all).toHaveBeenCalledTimes(1);
    expect(view.view === 'state' ? view.lastSession?.durationS : null).toBe(30);
  });

  it('asks for the stored session ids only when it may fetch', async () => {
    const brushed = await sonicareRig(PRESTIGE);
    rig = brushed;
    const ids = vi.spyOn(brushed.test.store.brushingSessions, 'handleIds');
    brushed.batch(0, [
      brushed.frame('4050', long(453_826), 0),
      brushed.frame('40d0', word(336), 0),
      brushed.frame('4010', '02', 0),
      brushed.frame('4082', '01', 0),
      brushed.frame('4090', word(5), 0),
    ]);
    brushed.batch(1, [brushed.frame('4090', word(6), 1)]);
    expect(ids).not.toHaveBeenCalled();
    brushed.batch(2, [brushed.frame('4082', '03', 2), brushed.frame('4010', '01', 2)]);
    expect(ids).toHaveBeenCalledTimes(1);
  });
});

describe('the modes a writable handle offers', () => {
  it('lists the Prestige modes without tongue care', async () => {
    const brushed = await sonicareRig(PRESTIGE);
    rig = brushed;
    const viewer = {
      clientId: brushed.owner.client.id,
      role: 'owner',
      profileId: brushed.owner.profile.id,
    } as const;
    const view = readBrush(depsOf(brushed), brushed.row(), viewer, { view: 'state' });
    expect(view.view === 'state' ? view.availableModes : []).toStrictEqual([
      'clean',
      'white_plus',
      'gum_health',
      'deep_clean_plus',
      'sensitive',
    ]);
    expect(lastState(brushed, 'brush_mode')).toBeUndefined();
  });
});
