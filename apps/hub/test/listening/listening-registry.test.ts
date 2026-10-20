import { ApiError, TALK_NEW_CHANNEL, type WakeArbitrated } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mirrorDiscordCall } from '../../src/listening/discord-row';
import { ListeningRegistry, type ListeningViewer } from '../../src/listening/listening-registry';
import { ReachRules } from '../../src/reach/reach-rules';
import { WakeClaims } from '../../src/wake-name/wake-claims';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const MEMBER: ListeningViewer = { owner: false, profileId: crypto.randomUUID() };
const OTHER = crypto.randomUUID();

let opened: TestStore;
let rules: ReachRules;
let registry: ListeningRegistry;
let announced: number;
let sent: { clientId: string; sourceKey: string; dbfs: number }[];
let online: Set<string>;
let owner: ListeningViewer;

function device(
  kind: 'camera' | 'phone' | 'computer',
  name: string,
  details: Record<string, string> = {},
  isOnline = true,
): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `${kind}-${name}`,
      parentId: null,
      kind,
      name,
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: isOnline,
      capabilities: [],
      details,
    },
  ]);
  return row?.id ?? '';
}

function camera(name: string): string {
  const id = device('camera', name);
  opened.store.cameras.upsert([
    {
      deviceId: id,
      streamName: name,
      sourceUrlKind: 'rtsp',
      physicalPtz: false,
      twoWayAudio: false,
    },
  ]);
  return id;
}

beforeEach(async () => {
  opened = await testStore();
  rules = new ReachRules(opened.store, () => new Date());
  announced = 0;
  sent = [];
  online = new Set();
  owner = { owner: true, profileId: opened.store.profiles.first().id };
  registry = new ListeningRegistry({
    store: opened.store,
    rules,
    cameraPauses: (): Promise<ReadonlyMap<string, never>> =>
      Promise.resolve(new Map<string, never>()),
    announce: (): void => {
      announced += 1;
    },
    connected: (): ReadonlySet<string> => online,
    sendLevel: (clientId: string, sourceKey: string, dbfs: number): void => {
      sent.push({ clientId, sourceKey, dbfs });
    },
    log: testLogger('listening'),
  });
  registry.start();
});

afterEach(async () => {
  registry.stop();
  await opened.close();
});

describe('new phones and computers', () => {
  it('start a phone off and a computer listening, and neither writes down', async () => {
    const phone = device('phone', 'Pixel', { profileId: MEMBER.profileId });
    const computer = device('computer', 'Desk');
    const { sources } = await registry.view(owner);
    expect(sources.find((one) => one.key === phone)).toMatchObject({
      kind: 'phone',
      wake: false,
      transcribe: false,
      state: 'off',
      writing: { state: 'off' },
      power_mode: 'always',
      profileId: MEMBER.profileId,
    });
    expect(sources.find((one) => one.key === computer)).toMatchObject({
      kind: 'computer',
      wake: true,
      transcribe: false,
    });
    expect(sources.find((one) => one.key === computer)).not.toHaveProperty('power_mode');
  });
});

describe('who sees what', () => {
  it('shows a member only their own phone and computer, never cameras or walkie', async () => {
    const own = device('phone', 'Mine', { profileId: MEMBER.profileId });
    device('phone', 'Theirs', { profileId: OTHER });
    device('computer', 'Hub computer');
    camera('Porch');
    const { sources } = await registry.view(MEMBER);
    expect(sources.map((one) => one.key)).toEqual([own]);
    expect((await registry.view(owner)).sources).toHaveLength(4);
  });

  it('refuses a member another person’s phone and any camera', async () => {
    const theirs = device('phone', 'Theirs', { profileId: OTHER });
    const porch = camera('Porch');
    await expect(registry.change(MEMBER, theirs, { wake: false })).rejects.toBeInstanceOf(ApiError);
    await expect(registry.change(MEMBER, porch, { wake: false })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('switches', () => {
  it('lets a member write down on their own phone and tells the app once', async () => {
    const own = device('phone', 'Mine', { profileId: MEMBER.profileId });
    const before = announced;
    const changed = await registry.change(MEMBER, own, { transcribe: true });
    expect(changed).toMatchObject({ transcribe: true, writing: { state: 'on' } });
    expect(registry.wanted(own)).toEqual({ wake: false, transcribe: true });
    expect(announced).toBe(before + 1);
  });

  it('keeps the power mode of a phone and refuses one for anything else', async () => {
    const own = device('phone', 'Mine', { profileId: MEMBER.profileId });
    const desk = device('computer', 'Desk');
    await registry.change(MEMBER, own, { wake: true });
    expect(await registry.change(MEMBER, own, { power_mode: 'away_from_home' })).toMatchObject({
      wake: true,
      power_mode: 'away_from_home',
    });
    expect(registry.powerModeOf(own)).toBe('away_from_home');
    await expect(registry.change(owner, desk, { power_mode: 'charging' })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('switches a camera’s wake through the Reach rule', async () => {
    const porch = camera('Porch');
    await registry.change(owner, porch, { wake: false });
    expect(rules.wakeOff()).toEqual([porch]);
    expect((await registry.source(owner, porch)).state).toBe('off');
    await registry.change(owner, porch, { wake: true, sensitivity: 'high' });
    expect(rules.wakeOff()).toEqual([]);
    expect(await registry.source(owner, porch)).toMatchObject({
      wake: true,
      sensitivity: 'high',
      state: 'listening',
    });
  });

  it('writes down on a camera through its own flag', async () => {
    const porch = camera('Porch');
    await registry.change(owner, porch, { transcribe: true });
    expect(opened.store.cameras.byDevice(porch).transcribe).toBe(true);
  });

  it('refuses wake on a camera not allowed to reach people', async () => {
    const porch = camera('Porch');
    rules.save(owner.profileId, { cameras: [] });
    await expect(registry.change(owner, porch, { wake: true })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('keeps walkie channels read only', async () => {
    const { members: _members, ...input } = TALK_NEW_CHANNEL.parse({ name: 'Garage' });
    const channel = opened.store.talk.createChannel(input);
    const row = await registry.source(owner, channel.id);
    expect(row).toMatchObject({ kind: 'walkie', wake: true, transcribe: true, changeable: false });
    await expect(registry.change(owner, channel.id, { wake: false })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('tells nothing when nothing changed', async () => {
    const own = device('phone', 'Mine', { profileId: MEMBER.profileId });
    await registry.change(MEMBER, own, { wake: true });
    const before = announced;
    registry.setState(own, null);
    expect(announced).toBe(before);
  });
});

describe('state', () => {
  it('shows offline, a reported conversation and the Discord rest', async () => {
    const own = device('phone', 'Mine', { profileId: MEMBER.profileId });
    const away = device('phone', 'Away', { profileId: MEMBER.profileId }, false);
    await registry.change(owner, own, { wake: true });
    await registry.change(owner, away, { wake: true });
    expect((await registry.source(owner, away)).state).toBe('offline');
    registry.setState(own, 'in_conversation');
    expect((await registry.source(owner, own)).state).toBe('in_conversation');
    registry.setState(own, 'discord_call');
    expect((await registry.source(owner, own)).state).toBe('discord_call');
    registry.setState(own, null);
    expect((await registry.source(owner, own)).state).toBe('listening');
  });

  it('shows why writing down is paused', async () => {
    const own = device('phone', 'Mine', { profileId: MEMBER.profileId });
    await registry.change(MEMBER, own, { transcribe: true });
    registry.setPaused(own, 'cap_reached');
    expect((await registry.source(owner, own)).writing).toEqual({
      state: 'paused',
      reason: 'cap_reached',
    });
  });

  it('lists a Discord row announced by its plugin', async () => {
    registry.setExternal({
      key: 'discord',
      kind: 'discord',
      name: 'Discord',
      profileId: null,
      wake: true,
      transcribe: false,
      state: 'listening',
      writing: { state: 'off' },
      sensitivity: null,
      changeable: false,
    });
    expect((await registry.view(owner)).sources.map((one) => one.key)).toContain('discord');
    expect((await registry.view(MEMBER)).sources).toEqual([]);
    registry.clearExternal('discord');
    expect((await registry.view(owner)).sources).toEqual([]);
  });
});

describe('needing a computer to listen', () => {
  it('shows a camera that is wanted and online as needing a computer, then listening again', async () => {
    const porch = camera('Porch');
    await registry.change(owner, porch, { transcribe: true });
    registry.setState(porch, 'no_host');
    expect((await registry.source(owner, porch)).state).toBe('no_host');
    registry.setState(porch, null);
    expect((await registry.source(owner, porch)).state).toBe('listening');
  });

  it('keeps a camera that is switched off showing off', async () => {
    const porch = camera('Porch');
    await registry.change(owner, porch, { wake: false, transcribe: false });
    registry.setState(porch, 'no_host');
    expect((await registry.source(owner, porch)).state).toBe('off');
  });

  it('shows a walkie channel that listens as needing a computer, and one that does not as off', async () => {
    const { members: _members, ...input } = TALK_NEW_CHANNEL.parse({ name: 'Garage' });
    const channel = opened.store.talk.createChannel(input);
    registry.setState(channel.id, 'no_host');
    expect((await registry.source(owner, channel.id)).state).toBe('no_host');
    opened.store.talk.updateChannel(channel.id, { ai_listens: false });
    expect((await registry.source(owner, channel.id)).state).toBe('off');
  });

  it('shows the Discord row as needing a computer while it has none', async () => {
    registry.setExternal({
      key: 'discord',
      kind: 'discord',
      name: 'Discord',
      profileId: null,
      wake: true,
      transcribe: true,
      state: 'listening',
      writing: { state: 'on' },
      sensitivity: null,
      changeable: false,
    });
    registry.setState('discord', 'no_host');
    expect((await registry.source(owner, 'discord')).state).toBe('no_host');
    registry.setState('discord', null);
    expect((await registry.source(owner, 'discord')).state).toBe('listening');
  });
});

describe('device row changes', () => {
  function upsertLight(isOnline: boolean, model: string): void {
    opened.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'light-1',
        parentId: null,
        kind: 'light',
        name: 'Lamp',
        model,
        manufacturer: 'm',
        providerRoom: null,
        roomId: null,
        online: isOnline,
        capabilities: [],
        details: {},
      },
    ]);
  }

  it('rebuilds the listening rows only for a phone, computer or camera that changed what is shown', () => {
    const rebuilds = vi.spyOn(opened.store.cameras, 'list');
    upsertLight(true, 'one');
    upsertLight(false, 'two');
    expect(rebuilds).not.toHaveBeenCalled();
    device('phone', 'Mine', { profileId: MEMBER.profileId });
    const added = rebuilds.mock.calls.length;
    expect(added).toBeGreaterThan(0);
    opened.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'phone-Mine',
        parentId: null,
        kind: 'phone',
        name: 'Mine',
        model: 'other model',
        manufacturer: 'm',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: { profileId: MEMBER.profileId },
      },
    ]);
    expect(rebuilds.mock.calls.length).toBe(added);
    device('phone', 'Mine', { profileId: MEMBER.profileId }, false);
    expect(rebuilds.mock.calls.length).toBeGreaterThan(added);
  });
});

describe('wake contests', () => {
  function contest(at: string, winnerKey: string, loserKey: string): WakeArbitrated {
    return {
      at,
      winner: { source: 'phone', key: winnerKey, snippetDbfs: -20 },
      decidedBy: 'loudest',
      claims: [
        { source: 'computer', key: loserKey, snippetDbfs: -30, afterMs: 0, outcome: 'superseded' },
        { source: 'phone', key: winnerKey, snippetDbfs: -20, afterMs: 200, outcome: 'won' },
      ],
    };
  }

  it('keeps the last five claims per source and the last contest', async () => {
    const phone = device('phone', 'Mine', { profileId: MEMBER.profileId });
    const computer = device('computer', 'Desk');
    for (let minute = 0; minute < 7; minute += 1) {
      const at = `2026-10-17T10:0${String(minute)}:00.000Z`;
      registry.contested(contest(at, phone, computer));
    }
    const view = await registry.view(owner);
    const claims = view.sources.find((one) => one.key === phone)?.claims ?? [];
    expect(claims).toHaveLength(5);
    expect(claims[0]).toEqual({
      at: '2026-10-17T10:06:00.000Z',
      snippetDbfs: -20,
      outcome: 'won',
    });
    expect(view.sources.find((one) => one.key === computer)?.claims[0]?.outcome).toBe('superseded');
    expect(view.last?.at).toBe('2026-10-17T10:06:00.000Z');
  });

  it('shows the contest the arbiter decided as the last wake with each outcome', async () => {
    const clock = new FakeClock('2026-10-17T10:00:00.000Z');
    const claims = new WakeClaims({ clock, log: testLogger('claims') });
    claims.onArbitrated((record) => {
      registry.contested(record);
    });
    const phone = device('phone', 'Mine');
    const computer = device('computer', 'Desk');
    const laptop = device('computer', 'Lap');
    claims.request({ source: 'computer', key: computer, snippetDbfs: -40 });
    clock.advanceTo('2026-10-17T10:00:00.300Z');
    claims.request({ source: 'computer', key: laptop, snippetDbfs: -30 });
    clock.advanceTo('2026-10-17T10:00:00.600Z');
    claims.request({ source: 'phone', key: phone, snippetDbfs: -20 });
    clock.advanceTo('2026-10-17T10:00:01.500Z');
    claims.request({ source: 'computer', key: computer, snippetDbfs: -5 });
    clock.advanceTo('2026-10-17T10:00:03.000Z');
    const view = await registry.view(owner);
    const outcomes = (key: string): string[] =>
      view.sources.find((one) => one.key === key)?.claims.map((claim) => claim.outcome) ?? [];
    expect(outcomes(phone)).toEqual(['stood_down']);
    expect(outcomes(laptop)).toEqual(['won']);
    expect(outcomes(computer)).toEqual(['stood_down', 'superseded']);
    expect(view.last).toMatchObject({
      winner: { key: laptop },
      decidedBy: 'computer',
      at: '2026-10-17T10:00:00.000Z',
    });
  });

  it('files a Discord claim under the Discord row', async () => {
    registry.setExternal({
      key: 'discord',
      kind: 'discord',
      name: 'Discord',
      profileId: null,
      wake: true,
      transcribe: false,
      state: 'listening',
      writing: { state: 'off' },
      sensitivity: null,
      changeable: false,
    });
    registry.contested({
      at: '2026-10-17T10:00:00.000Z',
      winner: { source: 'voice_call', key: 'guild:user', snippetDbfs: -40 },
      decidedBy: 'discord',
      claims: [
        { source: 'voice_call', key: 'guild:user', snippetDbfs: -40, afterMs: 0, outcome: 'won' },
      ],
    });
    const row = (await registry.view(owner)).sources.find((one) => one.key === 'discord');
    expect(row?.claims[0]?.outcome).toBe('won');
  });
});

describe('the Discord row', () => {
  it('appears while the bot is in a voice channel and goes when it leaves', async () => {
    let inVoice = false;
    let notify = (): void => undefined;
    const stop = mirrorDiscordCall(registry, {
      inVoice: (): boolean => inVoice,
      changes: (listener): (() => void) => {
        notify = listener;
        return (): void => undefined;
      },
    });
    const keys = async (): Promise<string[]> =>
      (await registry.view(owner)).sources.map((one) => one.key);
    expect(await keys()).not.toContain('discord');
    inVoice = true;
    notify();
    expect(await keys()).toContain('discord');
    expect(announced).toBeGreaterThan(0);
    inVoice = false;
    notify();
    expect(await keys()).not.toContain('discord');
    stop();
  });
});

describe('level meter', () => {
  it('meters one source per app and only for apps still connected', () => {
    const watched: [string, boolean][] = [];
    registry.levels.onWatched((key, on) => watched.push([key, on]));
    online.add('app-1');
    registry.levels.watch('app-1', 'a');
    registry.levels.watch('app-1', 'b');
    expect(registry.levels.watched('a')).toBe(false);
    expect(registry.levels.watched('b')).toBe(true);
    registry.levels.report('a', -30);
    registry.levels.report('b', -25);
    expect(sent).toEqual([{ clientId: 'app-1', sourceKey: 'b', dbfs: -25 }]);
    online.clear();
    registry.levels.report('b', -20);
    expect(registry.levels.watched('b')).toBe(false);
    expect(watched).toEqual([
      ['a', true],
      ['a', false],
      ['b', true],
      ['b', false],
    ]);
  });
});
