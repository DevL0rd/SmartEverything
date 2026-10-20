import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import {
  ApiError,
  MCP_TOOL_AREAS,
  NOTHING_IN_SCOPE,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  type AccessScopes,
  type ClientRow,
  type LiveChange,
  type LiveTable,
  type PersonBudget,
  type ProfileRow,
  type TalkFloorsNotice,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkedCommands } from '../../src/server/commands';
import { visibleDevices, visibleState } from '../../src/computers/computer-access';
import { OwnerAlerts, type OwnerAlert } from '../../src/extensions/owner-alerts';
import { Budget } from '../../src/ledger/budget';
import { CreditsWatch } from '../../src/ledger/budget-credits';
import { floorsSeenBy } from '../../src/server/live-access';
import { imageSpendCheck } from '../../src/server/image-authority';
import { visible, type Hearing } from '../../src/server/live-visibility';
import { assertModelAllowed, scopesOf } from '../../src/server/person-scope';
import { TalkMembership } from '../../src/talk/membership';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T10:00:00.000Z');

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => NOW);
});

afterEach(async () => {
  await opened.close();
});

interface Person {
  readonly profile: ProfileRow;
  readonly client: ClientRow;
}

function raw(work: (database: DatabaseSync) => void): void {
  const database = new DatabaseSync(join(opened.directory, 'test.db'));
  try {
    work(database);
  } finally {
    database.close();
  }
}

function member(name: string, scopes: Partial<AccessScopes>): Person {
  const profile = opened.store.profiles.create({ name });
  opened.store.personAccess.change(profile.id, {
    role: 'member',
    template: 'adult',
    scopes: { ...TEMPLATE_SCOPES.adult, ...scopes },
  });
  const client = opened.store.clients.create({
    name: `${name} phone`,
    platform: 'android',
    role: 'member',
    tokenHash: hashClientToken(createClientToken()),
    profileId: profile.id,
  });
  return { profile, client };
}

function owner(): Person {
  const profile = opened.store.profiles.create({ name: 'Owner' });
  opened.store.personAccess.change(profile.id, { role: 'owner', template: 'owner' });
  const client = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: hashClientToken(createClientToken()),
    profileId: profile.id,
  });
  return { profile, client };
}

function device(externalId: string, kind: 'light' | 'camera', roomId: string): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId,
      parentId: null,
      kind,
      name: externalId,
      model: 'model.one',
      manufacturer: 'Maker',
      providerRoom: null,
      roomId,
      online: true,
      capabilities: [
        { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
      ],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('the device was stored');
  return row.id;
}

function refusal(work: () => unknown): ApiError {
  try {
    work();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('reading the stored limits', () => {
  it('gives a person with an unreadable or missing row no access at all', () => {
    const kid = member('Kid', {});
    expect(scopesOf(opened.store, kid.profile.id)).toStrictEqual({
      ...TEMPLATE_SCOPES.adult,
      devices: { ...TEMPLATE_SCOPES.adult.devices, hidden: [] },
    });
    raw((database) => {
      database.exec(
        `update person_access set scopes = '{}' where profile_id = '${kid.profile.id}'`,
      );
    });
    const nothing = { ...NOTHING_IN_SCOPE, devices: { ...NOTHING_IN_SCOPE.devices, hidden: [] } };
    expect(scopesOf(opened.store, kid.profile.id)).toStrictEqual(nothing);
    expect(scopesOf(opened.store, '00000000-0000-4000-8000-000000000000')).toStrictEqual(nothing);
  });
});

describe('the devices a person sees and commands', () => {
  function home(): { lamp: string; camera: string; hall: string } {
    const study = opened.store.rooms.create('Study', 0).id;
    const hall = opened.store.rooms.create('Hall', 1).id;
    return { lamp: device('lamp', 'light', study), camera: device('camera', 'camera', hall), hall };
  }

  it('lists and states only the devices in scope for a member and everything for an owner', () => {
    const { lamp, camera } = home();
    const kid = member('Kid', { devices: { mode: 'only', rooms: [], devices: [lamp] } });
    const parent = owner();
    for (const id of [lamp, camera]) {
      opened.store.state.write([
        { deviceId: id, capability: 'power', value: true, observedAt: NOW.toISOString() },
      ]);
    }
    const asKid = { kind: 'client', client: kid.client } as const;
    const asOwner = { kind: 'client', client: parent.client } as const;
    expect(visibleDevices(opened.store, asKid).map((row) => row.id)).toStrictEqual([lamp]);
    expect(visibleState(opened.store, asKid).map((row) => row.device_id)).toStrictEqual([lamp]);
    expect(visibleDevices(opened.store, asOwner)).toHaveLength(2);
  });

  it('refuses a command to a device out of scope, audits it and still sends to the others', () => {
    const { lamp, camera, hall } = home();
    const kid = member('Kid', { devices: { mode: 'except', rooms: [hall], devices: [] } });
    const command = (deviceId: string): Parameters<typeof checkedCommands>[1] => [
      { device_id: deviceId, capability: 'power', value: true, source: 'app' },
    ];
    expect(checkedCommands(opened.store, command(lamp), kid.client)).toHaveLength(1);
    const refused = refusal(() => checkedCommands(opened.store, command(camera), kid.client));
    expect(refused.code).toBe('forbidden');
    expect(opened.store.accessAudit.list(10, kid.profile.id).map((entry) => entry.kind)).toContain(
      'refused_scope',
    );
    const parent = owner();
    expect(checkedCommands(opened.store, command(camera), parent.client)).toHaveLength(1);
  });

  it('hides what belongs to an out-of-scope device from the live feed of a member', () => {
    const { lamp, camera } = home();
    const kid = member('Kid', { devices: { mode: 'only', rooms: [], devices: [lamp] } });
    const parent = owner();
    const connection = (person: Person, table: LiveTable): Hearing => ({
      client: person.client,
      tables: new Set<LiveTable>([table]),
    });
    const command = (deviceId: string): LiveChange => ({
      type: 'change',
      seq: 1,
      table: 'commands',
      operation: 'INSERT',
      record: {
        id: '11111111-1111-4111-8111-111111111111',
        device_id: deviceId,
        capability: 'power',
        value: true,
        status: 'pending',
        source: 'app',
        result: null,
        error: null,
        requested_by: null,
        created_at: NOW.toISOString(),
        started_at: null,
        finished_at: null,
        expires_at: NOW.toISOString(),
      },
      oldRecord: null,
    });
    expect(visible(connection(kid, 'commands'), command(camera), opened.store)).toBe(false);
    expect(visible(connection(kid, 'commands'), command(lamp), opened.store)).toBe(true);
    expect(visible(connection(parent, 'commands'), command(camera), opened.store)).toBe(true);
  });
});

describe('the models a person may use', () => {
  it('lets an owner person and an open list use any model and holds a limited person to the list', () => {
    const open = member('Open', {});
    const limited = member('Limited', { models: { mode: 'only', ids: ['openai/gpt-6'] } });
    const parent = owner();
    assertModelAllowed(opened.store, open.profile.id, 'google/gemini-3');
    assertModelAllowed(opened.store, parent.profile.id, 'google/gemini-3');
    assertModelAllowed(opened.store, limited.profile.id, 'openai/gpt-6');
    const refused = refusal(() => {
      assertModelAllowed(opened.store, limited.profile.id, 'google/gemini-3');
    });
    expect(refused.code).toBe('forbidden');
    expect(refused.message).toContain('google/gemini-3');
    expect(opened.store.accessAudit.list(10, limited.profile.id)).toHaveLength(1);
  });
});

describe('the walkie-talkie channels a person hears', () => {
  it('drops a channel outside the list from the membership of their devices and brings it back', () => {
    const house = opened.store.talk.createChannel({
      name: 'House',
      icon: 'radio',
      priority: 'normal',
      keep_hours: 24,
      ai_listens: true,
    });
    const garage = opened.store.talk.createChannel({
      name: 'Garage',
      icon: 'radio',
      priority: 'normal',
      keep_hours: 24,
      ai_listens: true,
    });
    const kid = member('Kid', { channels: { mode: 'only', ids: [house.id] } });
    for (const channel of [house, garage]) {
      opened.store.talk.setMember(
        { channelId: channel.id, kind: 'client', memberId: kid.client.id },
        true,
        { label: 'Kid', detail: 'Kid phone' },
      );
    }
    const membership = new TalkMembership(opened.store);
    expect(membership.channelsOf(kid.client.id)).toStrictEqual([house.id]);
    expect(membership.hears(kid.client.id, garage.id)).toBe(false);
    opened.store.personAccess.change(kid.profile.id, {
      scopes: { ...TEMPLATE_SCOPES.adult, channels: { mode: 'all', ids: [] } },
    });
    membership.reload();
    expect([...membership.channelsOf(kid.client.id)].sort()).toStrictEqual(
      [house.id, garage.id].sort(),
    );
  });
});

describe('the walkie-talkie floors a person is told about', () => {
  function floor(channelId: string): TalkFloorsNotice['floors'][number] {
    return {
      channelId,
      messageId: `message-${channelId}`,
      kind: 'talk',
      speaker: { kind: 'client', id: 'speaker', label: 'Speaker', detail: null },
      startedAt: NOW.toISOString(),
    };
  }

  const notice = (channels: readonly string[]): TalkFloorsNotice => ({
    type: 'talk_floors',
    floors: channels.map(floor),
    online: ['speaker'],
  });

  it('keeps only the floors of the listed channels for a limited person', () => {
    const [house, garage] = ['House', 'Garage'].map((name) =>
      opened.store.talk.createChannel({
        name,
        icon: 'radio',
        priority: 'normal',
        keep_hours: 24,
        ai_listens: true,
      }),
    );
    if (house === undefined || garage === undefined) throw new Error('both channels were made');
    const kid = member('Kid', { channels: { mode: 'only', ids: [house.id] } });
    const seen = floorsSeenBy(kid, notice([house.id, garage.id]), opened.store);
    expect(seen.floors.map((one) => one.channelId)).toStrictEqual([house.id]);
    expect(seen.online).toStrictEqual(['speaker']);
  });

  it('tells an owner about every floor', () => {
    const boss = owner();
    const seen = floorsSeenBy(boss, notice(['house', 'garage']), opened.store);
    expect(seen.floors).toHaveLength(2);
  });
});

describe('the AI budget of a person', () => {
  function budget(): { budget: Budget; alerts: OwnerAlert[] } {
    const alerts = new OwnerAlerts();
    const raised: OwnerAlert[] = [];
    alerts.listen((alert) => {
      raised.push(alert);
    });
    const made = new Budget({
      ledger: opened.store.ledger,
      settings: opened.store.settingsKv,
      credits: new CreditsWatch(
        {
          hasKey: (): boolean => false,
          credits: (): Promise<{ total: number; used: number }> =>
            Promise.reject(new Error('no key')),
        },
        () => NOW,
        testLogger('budget'),
      ),
      people: {
        budget: (profileId): PersonBudget | null | undefined =>
          opened.store.personAccess.budget(profileId),
        budgeted: (): readonly string[] => opened.store.personAccess.budgetedIds(),
        name: (profileId): string => opened.store.profiles.byId(profileId).name,
      },
      alerts,
      note: (): void => undefined,
      now: (): Date => NOW,
      log: testLogger('budget'),
    });
    made.start();
    return { budget: made, alerts: raised };
  }

  function spend(profileId: string, micros: number): void {
    opened.store.ledger.record({
      profile_id: profileId,
      source: 'openrouter',
      work: 'chat',
      model_id: 'openai/gpt-6',
      cost_micros: micros,
      cost_state: 'reported',
    });
  }

  it('stops that person, and nobody else, once the daily limit is used up with the hard stop on', () => {
    const kid = member('Kid', {});
    const other = member('Other', {});
    opened.store.personAccess.change(kid.profile.id, {
      budget: { daily_usd: 1, monthly_usd: null, warn_at_percent: 80, hard_stop: true },
    });
    const { budget: running } = budget();
    running.gate.check('chat', { profileId: kid.profile.id });
    spend(kid.profile.id, 1_000_000);
    const stopped = refusal(() => {
      running.gate.check('chat', { profileId: kid.profile.id });
    });
    expect(stopped.message).toContain('Your AI budget is used up');
    running.gate.check('chat', { profileId: other.profile.id });
    running.gate.check('chat');
    running.stop();
  });

  it('stops the metered image spend of that person once the daily limit is used up', () => {
    const kid = member('Kid', {});
    const other = member('Other', {});
    opened.store.personAccess.change(kid.profile.id, {
      budget: { daily_usd: 1, monthly_usd: null, warn_at_percent: 80, hard_stop: true },
    });
    const { budget: running } = budget();
    const imageSpend = imageSpendCheck(running.gate);
    imageSpend({ background: false, profileId: kid.profile.id });
    spend(kid.profile.id, 1_000_000);
    const stopped = refusal(() => {
      imageSpend({ background: false, profileId: kid.profile.id });
    });
    expect(stopped.message).toContain('Your AI budget is used up');
    imageSpend({ background: false, profileId: other.profile.id });
    running.stop();
  });

  it('only warns when the hard stop is off, to the owner and to the person', () => {
    const kid = member('Kid', {});
    opened.store.personAccess.change(kid.profile.id, {
      budget: { daily_usd: 1, monthly_usd: null, warn_at_percent: 50, hard_stop: false },
    });
    const { budget: running, alerts } = budget();
    spend(kid.profile.id, 600_000);
    running.gate.check('chat', { profileId: kid.profile.id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ person: kid.profile.id });
    expect(alerts[0]?.title).toContain('Kid');
    spend(kid.profile.id, 600_000);
    running.gate.check('chat', { profileId: kid.profile.id });
    expect(alerts).toHaveLength(2);
    running.stop();
  });

  it('refuses loudly when the stored budget cannot be read', () => {
    const kid = member('Kid', {});
    raw((database) => {
      database.exec(
        `update person_access set budget = '{"daily_usd":"lots"}' where profile_id = '${kid.profile.id}'`,
      );
    });
    const { budget: running } = budget();
    const refused = refusal(() => {
      running.gate.check('chat', { profileId: kid.profile.id });
    });
    expect(refused.message).toContain('cannot be read');
    running.stop();
  });
});

describe('the areas of the templates', () => {
  it('lists the areas a guest lacks', () => {
    expect(TEMPLATE_SCOPES.guest.areas.length).toBeLessThan(MCP_TOOL_AREAS.length);
  });
});

describe('the live tables of an area a person lacks', () => {
  it('stay silent for a member without the area and still reach an owner', () => {
    const kid = member('Kid', {
      areas: MCP_TOOL_AREAS.filter((area) => area !== 'automations'),
    });
    const parent = owner();
    const change: LiveChange = {
      type: 'change',
      seq: 1,
      table: 'scenes',
      operation: 'INSERT',
      record: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Night',
        icon: 'moon',
        actions: [],
        position: 0,
        created_at: NOW.toISOString(),
      },
      oldRecord: null,
    };
    const hearing = (person: Person): Hearing => ({
      client: person.client,
      tables: new Set<LiveTable>(['scenes']),
    });
    expect(visible(hearing(kid), change, opened.store)).toBe(false);
    expect(visible(hearing(parent), change, opened.store)).toBe(true);
    const allowed = member('Allowed', {});
    expect(visible(hearing(allowed), change, opened.store)).toBe(true);
  });
});
