import type { NetworkClient, PluginEvent, PresencePerson } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import type { ToolCaller } from '../../../src/ai-tools/hub-tool';
import { ClientRegistry } from '../../../src/plugins/builtin/router/client-registry';
import {
  peopleControls,
  type PeopleControls,
} from '../../../src/plugins/builtin/router/people-controls';
import {
  PeopleRegistry,
  type PhoneSighting,
} from '../../../src/plugins/builtin/router/people-registry';
import { peopleTools } from '../../../src/plugins/builtin/router/people-tools';
import { memoryRecords } from '../memory-records';

const ANNA_PHONE = 'aa:bb:cc:00:00:01';
const ANNA_LAPTOP = 'aa:bb:cc:00:00:02';
const MARIA = '10000000-0000-4000-8000-000000000001';
const GRACE_MS = 5 * 60 * 1000;
const T0 = Date.parse('2026-10-18T08:00:00.000Z');

function at(offsetMs: number): Date {
  return new Date(T0 + offsetMs);
}

function client(mac: string, connected: boolean): NetworkClient {
  return {
    mac,
    name: mac,
    ip: null,
    connection: connected ? 'wifi' : null,
    band: null,
    connected,
    blocked: false,
    trafficBytesPerSecond: null,
    profileId: null,
    personId: null,
    firstSeen: null,
    lastSeen: null,
  };
}

function owner(): ToolCaller {
  return { profileId: MARIA, role: 'owner', chatId: null, via: 'app', clientId: 'client-1' };
}

interface Rig {
  readonly look: (online: readonly string[], offset: number) => PresencePerson[];
  readonly controls: () => PeopleControls;
  readonly restart: () => void;
  readonly kinds: () => string[];
  readonly phone: { sighting: PhoneSighting };
  readonly state: () => { readonly clients: ClientRegistry; readonly people: PeopleRegistry };
}

function rig(): Rig {
  const log = new Logger('hub.router');
  const events: PluginEvent[] = [];
  const emit = (event: PluginEvent): void => {
    events.push(event);
  };
  const phone: { sighting: PhoneSighting } = { sighting: { paired: false, place: null } };
  const clientRecords = memoryRecords();
  const peopleRecords = memoryRecords();
  const profiles = [{ id: MARIA, name: 'Maria' }];
  const build = (): { clients: ClientRegistry; people: PeopleRegistry } => ({
    clients: new ClientRegistry(clientRecords, emit, log),
    people: new PeopleRegistry(
      peopleRecords,
      emit,
      { profiles: () => profiles, phone: () => phone.sighting },
      log,
    ),
  });
  let state = build();
  return {
    phone,
    state: () => state,
    look: (online, offset): PresencePerson[] => {
      const now = at(offset);
      state.clients.observe(
        [ANNA_PHONE, ANNA_LAPTOP].map((mac) => client(mac, online.includes(mac))),
        now,
      );
      return [...state.people.evaluate(state.clients.known(), now)];
    },
    controls: () =>
      peopleControls({
        people: state.people,
        current: () => [...state.people.evaluate(state.clients.known(), at(0))],
        known: () => state.clients.known(),
        assign: (mac, link) => state.clients.assign(mac, link),
        refresh: () => undefined,
      }),
    restart: (): void => {
      state = build();
    },
    kinds: () =>
      events
        .filter((event) => event.kind.startsWith('person_'))
        .map((event) => `${event.kind}:${event.subject ?? ''}`),
  };
}

function annaWithTwoDevices(): Rig {
  const home = rig();
  home.look([ANNA_PHONE, ANNA_LAPTOP], 0);
  const controls = home.controls();
  controls.link({ mac: ANNA_PHONE, person: null, newPerson: 'Anna' });
  controls.link({ mac: ANNA_LAPTOP, person: null, newPerson: 'anna' });
  return home;
}

describe('known people from network devices', () => {
  it('names a device as a new person and links a second device to the same person', () => {
    const home = annaWithTwoDevices();
    const people = home.look([ANNA_PHONE], 1_000).filter((person) => !person.profile);
    expect(people).toHaveLength(1);
    expect(people[0]?.name).toBe('Anna');
    expect(people[0]?.devices.map((device) => device.mac).sort()).toEqual([
      ANNA_PHONE,
      ANNA_LAPTOP,
    ]);
  });

  it('is home while any one linked device is present and announces the arrival once', () => {
    const home = annaWithTwoDevices();
    home.look([ANNA_PHONE], 1_000);
    home.look([ANNA_PHONE, ANNA_LAPTOP], 2_000);
    home.look([ANNA_LAPTOP], 3_000);
    expect(home.kinds()).toEqual(['person_arrived:Anna']);
  });

  it('keeps the person home through Wi-Fi sleep and announces the departure after the grace period', () => {
    const home = annaWithTwoDevices();
    home.look([ANNA_PHONE], 1_000);
    home.look([], 2_000);
    const sleeping = home.look([], GRACE_MS - 1_000);
    expect(sleeping.find((person) => person.name === 'Anna')?.home).toBe(true);
    expect(home.kinds()).toEqual(['person_arrived:Anna']);
    const gone = home.look([], GRACE_MS + 3_000);
    expect(gone.find((person) => person.name === 'Anna')?.home).toBe(false);
    expect(home.kinds()).toEqual(['person_arrived:Anna', 'person_left:Anna']);
  });

  it('does not announce a false departure or arrival after a hub restart', () => {
    const home = annaWithTwoDevices();
    home.look([ANNA_PHONE], 1_000);
    const before = home.kinds();
    home.restart();
    const after = home.look([ANNA_PHONE], 10_000);
    expect(after.find((person) => person.name === 'Anna')?.home).toBe(true);
    expect(home.kinds()).toEqual(before);
  });

  it('stops presence and its events for a person whose tracking is switched off', () => {
    const home = annaWithTwoDevices();
    const person = home.state().clients.known()[0]?.personId ?? '';
    home.controls().manage({ action: 'track', person, tracked: false });
    const shown = home.look([ANNA_PHONE], 1_000).find((anna) => anna.name === 'Anna');
    expect(shown).toMatchObject({ tracked: false, home: false, since: null });
    expect(home.kinds()).toEqual([]);
  });

  it('forgets a removed person and unlinks their devices', () => {
    const home = annaWithTwoDevices();
    const anna = home.look([ANNA_PHONE], 0).find((person) => person.name === 'Anna');
    home.controls().manage({ action: 'remove', person: anna?.id ?? '' });
    expect(home.look([ANNA_PHONE], 1_000).some((person) => person.name === 'Anna')).toBe(false);
    expect(
      home
        .state()
        .clients.known()
        .every((known) => known.personId === null),
    ).toBe(true);
  });
});

describe('people with an account', () => {
  it('is home when the paired phone reports the Home place, with no router device', () => {
    const home = rig();
    home.look([], 0);
    home.phone.sighting = { paired: true, place: 'Work' };
    expect(home.look([], 1_000).find((person) => person.id === MARIA)?.home).toBe(false);
    home.phone.sighting = { paired: true, place: 'Home' };
    const maria = home.look([], 2_000).find((person) => person.id === MARIA);
    expect(maria).toMatchObject({ home: true, viaPhone: true, profile: true });
    expect(home.kinds()).toEqual(['person_arrived:Maria']);
  });

  it('uses devices assigned to the profile like any other person and hides profiles with nothing to sense', () => {
    const home = rig();
    expect(home.look([ANNA_PHONE], 0).some((person) => person.id === MARIA)).toBe(false);
    home.controls().link({ mac: ANNA_PHONE, person: MARIA, newPerson: null });
    const maria = home.look([ANNA_PHONE], 1_000).find((person) => person.id === MARIA);
    expect(maria?.home).toBe(true);
    expect(
      home
        .state()
        .clients.known()
        .find((known) => known.mac === ANNA_PHONE),
    ).toMatchObject({
      profileId: MARIA,
      personId: null,
    });
  });
});

describe('people tools', () => {
  it('answers who is home and who arrived last for any caller', async () => {
    const home = annaWithTwoDevices();
    home.look([ANNA_PHONE], 1_000);
    const tools = peopleTools(home.controls());
    const who = tools.find((tool) => tool.name === 'who_is_home');
    const member: ToolCaller = { ...owner(), role: 'member' };
    const result = await who?.run({}, member);
    expect(result?.response).toMatchObject({
      home: ['Anna'],
      lastArrived: { name: 'Anna' },
      lastLeft: null,
    });
  });

  it('lets only the owner name a device as a person or manage people', async () => {
    const home = rig();
    home.look([ANNA_PHONE], 0);
    const tools = peopleTools(home.controls());
    const member: ToolCaller = { ...owner(), role: 'member' };
    const link = tools.find((tool) => tool.name === 'link_device');
    const manage = tools.find((tool) => tool.name === 'manage_person');
    const refused = await link?.run({ mac: ANNA_PHONE, newPerson: 'Anna' }, member);
    expect(refused?.response).toHaveProperty('error');
    const refusedManage = await manage?.run({ change: { action: 'add', name: 'Bob' } }, member);
    expect(refusedManage?.response).toHaveProperty('error');
    expect(home.look([ANNA_PHONE], 1_000).some((person) => person.name === 'Anna')).toBe(false);
    const done = await link?.run({ mac: ANNA_PHONE, newPerson: 'Anna' }, owner());
    expect(done?.response).toHaveProperty('client');
    expect(home.look([ANNA_PHONE], 2_000).find((person) => person.name === 'Anna')?.home).toBe(
      true,
    );
  });

  it('reports a device the router never saw instead of creating a person', async () => {
    const home = rig();
    home.look([ANNA_PHONE], 0);
    const link = peopleTools(home.controls()).find((tool) => tool.name === 'link_device');
    const result = await link?.run({ mac: 'aa:bb:cc:99:99:99', newPerson: 'Ghost' }, owner());
    expect(result?.response).toHaveProperty('error');
    expect(home.look([ANNA_PHONE], 1_000).some((person) => person.name === 'Ghost')).toBe(false);
  });
});
