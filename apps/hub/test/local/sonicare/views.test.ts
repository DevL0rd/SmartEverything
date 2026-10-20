import { ApiError, type BrushReadQuery } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { actBrush, type Actor } from '../../../src/local/toothbrush/acts';
import type { Viewer } from '../../../src/local/toothbrush/access';
import { homeClock } from '../../../src/local/toothbrush/clock';
import { readBrush, type ViewDeps } from '../../../src/local/toothbrush/views';
import {
  NO_PHONE,
  identityOf,
  sonicareRig,
  word,
  type Person,
  type SonicareRig,
} from '../../support/sonicare-rig';
import { testLogger } from '../../support/logs';

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

function viewerOf(person: Person, role: 'owner' | 'member'): Viewer {
  return { clientId: person.client.id, role, profileId: person.profile.id };
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

async function brushedTwice(owns: 'owner' | 'member'): Promise<SonicareRig> {
  const brushed = await sonicareRig(identityOf(), {}, owns);
  brushed.batch(0, [
    brushed.frame('4022', '00010204', 0),
    brushed.frame('4080', '01', 0),
    brushed.frame('4091', word(120), 0),
    brushed.frame('2a19', '50', 0),
  ]);
  for (const start of [10, 400]) {
    brushed.batch(start, [
      brushed.frame('4010', '02', start),
      brushed.frame('4082', '01', start),
      brushed.frame('4090', word(0), start),
    ]);
    brushed.batch(start + 120, [
      brushed.frame('4090', word(120), start + 120),
      brushed.frame('4082', '03', start + 120),
      brushed.frame('4010', '01', start + 120),
    ]);
  }
  return brushed;
}

function read(
  brushed: SonicareRig,
  viewer: Viewer,
  query: BrushReadQuery,
): ReturnType<typeof readBrush> {
  return readBrush(depsOf(brushed), brushed.row(), viewer, query);
}

describe('a brush that belongs to the owner', () => {
  it('shows the owner today, the streak, the score and the last session', async () => {
    rig = await brushedTwice('owner');
    const view = read(rig, viewerOf(rig.owner, 'owner'), { view: 'state' });
    expect(view).toMatchObject({
      view: 'state',
      mine: true,
      personName: rig.owner.profile.name,
      model: 'HX992X',
      today: { counted: 2, percent: 100, morning: true },
      streak: 1,
    });
    expect(view.view === 'state' ? view.lastSession?.durationS : null).toBe(120);
    expect(view.view === 'state' ? view.availableModes : []).toStrictEqual([
      'clean',
      'white_plus',
      'gum_health',
      'deep_clean_plus',
    ]);
    expect(view.view === 'state' ? view.writes.allowed : true).toBe(false);
  });

  it('hides every session detail from a member and keeps the device level facts', async () => {
    rig = await brushedTwice('owner');
    const view = read(rig, viewerOf(rig.member, 'member'), { view: 'state' });
    expect(view).toMatchObject({
      mine: false,
      today: null,
      streak: null,
      score: null,
      lastSession: null,
      frame: { detailVisible: false },
      battery: { percent: 0x50 },
      personName: rig.owner.profile.name,
    });
  });

  it('lists no sessions for a member and says how many belong to someone else', async () => {
    rig = await brushedTwice('owner');
    const view = read(rig, viewerOf(rig.member, 'member'), { view: 'sessions' });
    expect(view).toMatchObject({ view: 'sessions', sessions: [], hidden: 2, more: false });
    const own = read(rig, viewerOf(rig.owner, 'owner'), { view: 'sessions', limit: 1 });
    expect(own).toMatchObject({ sessions: [{}], more: true, hidden: 0 });
  });

  it('refuses a member one session of someone else and another person’s statistics', async () => {
    rig = await brushedTwice('owner');
    const [first] = rig.test.store.brushingSessions.all(rig.device.id, undefined);
    const member = viewerOf(rig.member, 'member');
    expect(() => read(rig!, member, { view: 'session', sessionId: first?.id ?? '' })).toThrow(
      ApiError,
    );
    expect(() => read(rig!, member, { view: 'stats', personId: rig!.owner.profile.id })).toThrow(
      ApiError,
    );
    const mine = read(rig, member, { view: 'stats' });
    expect(mine).toMatchObject({ view: 'stats', personId: rig.member.profile.id });
    expect(mine.view === 'stats' ? mine.stats.totals.sessions : -1).toBe(0);
  });

  it('keeps the settings and the diagnostics to the owner', async () => {
    rig = await brushedTwice('owner');
    const member = viewerOf(rig.member, 'member');
    expect(read(rig, member, { view: 'settings' })).toMatchObject({
      settings: null,
      mayConfigure: false,
    });
    expect(() => read(rig!, member, { view: 'diagnostics' })).toThrow(ApiError);
    const owner = read(rig, viewerOf(rig.owner, 'owner'), { view: 'diagnostics' });
    expect(owner).toMatchObject({
      view: 'diagnostics',
      brand: { identity: { serial: '0143C5C968' } },
    });
  });

  it('computes the statistics of the week for the brush person', async () => {
    rig = await brushedTwice('owner');
    const view = read(rig, viewerOf(rig.owner, 'owner'), { view: 'stats', range: 'week' });
    expect(view.view === 'stats' ? view.stats.totals : null).toMatchObject({
      sessions: 2,
      complete: 2,
    });
    expect(view.view === 'stats' ? view.stats.range : null).toBe('week');
  });

  it('shows head and battery history views', async () => {
    rig = await brushedTwice('owner');
    const owner = viewerOf(rig.owner, 'owner');
    expect(read(rig, owner, { view: 'head' })).toMatchObject({ view: 'head', timeline: [] });
    expect(read(rig, owner, { view: 'battery' })).toMatchObject({ view: 'battery', levels: [] });
    expect(read(rig, owner, { view: 'handle' })).toMatchObject({ view: 'handle' });
  });
});

describe('a brush that belongs to a member', () => {
  it('shows the member their own sessions and the owner everything', async () => {
    rig = await brushedTwice('member');
    const member = read(rig, viewerOf(rig.member, 'member'), { view: 'state' });
    expect(member).toMatchObject({ mine: true, today: { counted: 2 } });
    const sessions = read(rig, viewerOf(rig.member, 'member'), { view: 'sessions' });
    expect(sessions).toMatchObject({ sessions: [{}, {}], hidden: 0 });
    const owner = read(rig, viewerOf(rig.owner, 'owner'), { view: 'state' });
    expect(owner).toMatchObject({ mine: true, personName: rig.member.profile.name });
  });

  it('lets a member hand a session of theirs only to themselves or nobody', async () => {
    rig = await brushedTwice('member');
    const deps = {
      store: rig.test.store,
      fleet: rig.fleet,
      local: { observe: (): Promise<void> => Promise.resolve() },
      bridges: { takeOver: (): Promise<never> => Promise.reject(new Error('unused')) },
      ...NO_PHONE,
      now: rig.clock.now,
      log: testLogger('sonicare'),
    };
    const [session] = rig.test.store.brushingSessions.all(rig.device.id, undefined);
    const memberActor: Actor = {
      ...viewerOf(rig.member, 'member'),
      client: rig.member.client,
      phone: true,
    };
    const ownerActor: Actor = {
      ...viewerOf(rig.owner, 'owner'),
      client: rig.owner.client,
      phone: true,
    };
    await expect(
      actBrush(deps, rig.row(), memberActor, {
        action: 'assign_session',
        sessionId: session?.id ?? '',
        personId: rig.owner.profile.id,
      }),
    ).rejects.toThrow('Only the owner assigns a session to another person.');
    await expect(
      actBrush(deps, rig.row(), memberActor, {
        action: 'assign_session',
        sessionId: session?.id ?? '',
        personId: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      actBrush(deps, rig.row(), memberActor, {
        action: 'forget_session',
        sessionId: session?.id ?? '',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      actBrush(deps, rig.row(), ownerActor, {
        action: 'forget_session',
        sessionId: session?.id ?? '',
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(rig.test.store.brushingSessions.all(rig.device.id, undefined)).toHaveLength(1);
  });
});

describe('who a member may say uses a brush', () => {
  function actDepsOf(brushed: SonicareRig): Parameters<typeof actBrush>[0] {
    return {
      store: brushed.test.store,
      fleet: brushed.fleet,
      local: { observe: (): Promise<void> => Promise.resolve() },
      bridges: { takeOver: (): Promise<never> => Promise.reject(new Error('unused')) },
      ...NO_PHONE,
      now: brushed.clock.now,
      log: testLogger('sonicare'),
    };
  }

  it('refuses a member taking over or releasing the brush of another person', async () => {
    rig = await brushedTwice('owner');
    const member: Actor = {
      ...viewerOf(rig.member, 'member'),
      client: rig.member.client,
      phone: true,
    };
    await expect(
      actBrush(actDepsOf(rig), rig.row(), member, { action: 'set_person', personId: null }),
    ).rejects.toThrow('Only the owner says who uses this brush.');
    await expect(
      actBrush(actDepsOf(rig), rig.row(), member, {
        action: 'set_person',
        personId: rig.member.profile.id,
      }),
    ).rejects.toThrow(ApiError);
  });

  it('lets a member claim a brush nobody uses and release it again', async () => {
    rig = await brushedTwice('owner');
    const owner: Actor = { ...viewerOf(rig.owner, 'owner'), client: rig.owner.client, phone: true };
    const member: Actor = {
      ...viewerOf(rig.member, 'member'),
      client: rig.member.client,
      phone: true,
    };
    await actBrush(actDepsOf(rig), rig.row(), owner, { action: 'set_person', personId: null });
    await expect(
      actBrush(actDepsOf(rig), rig.row(), member, {
        action: 'set_person',
        personId: rig.member.profile.id,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      actBrush(actDepsOf(rig), rig.row(), member, { action: 'set_person', personId: null }),
    ).resolves.toMatchObject({ ok: true });
  });
});
