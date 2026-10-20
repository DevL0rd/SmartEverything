import type { SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ListeningRegistry, type ListeningViewer } from '../../src/listening/listening-registry';
import { ReachRules } from '../../src/reach/reach-rules';
import { emitReachSignals } from '../../src/server/reach-signals';
import { SignalBus } from '../../src/signals/bus';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const PERSON = crypto.randomUUID();

let opened: TestStore;
let registry: ListeningRegistry;
let owner: ListeningViewer;
let heard: SignalInput[];
let stop: () => void;

function device(
  kind: 'phone' | 'computer',
  name: string,
  details: Record<string, string> = {},
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
      online: true,
      capabilities: [],
      details,
    },
  ]);
  return row?.id ?? '';
}

function open(): void {
  const clock = new FakeClock('2026-10-18T10:00:00.000Z');
  const rules = new ReachRules(opened.store, clock.now);
  registry = new ListeningRegistry({
    store: opened.store,
    rules,
    cameraPauses: (): Promise<ReadonlyMap<string, never>> =>
      Promise.resolve(new Map<string, never>()),
    announce: (): void => undefined,
    connected: (): ReadonlySet<string> => new Set(),
    sendLevel: (): void => undefined,
    log: testLogger('listening'),
  });
  registry.start();
  const bus = new SignalBus({ log: testLogger('signals'), now: clock.now });
  bus.subscribe((signal) => {
    if (signal.source === 'listening') heard.push(signal);
  });
  stop = emitReachSignals(
    bus,
    {
      listening: registry,
      claims: { onArbitrated: (): (() => void) => (): void => undefined },
      voice: { onCall: (): (() => void) => (): void => undefined },
    },
    clock.now,
  );
}

function values(): unknown[] {
  return heard.map((signal) => signal.value);
}

beforeEach(async () => {
  opened = await testStore();
  owner = { owner: true, profileId: opened.store.profiles.first().id };
  heard = [];
});

afterEach(async () => {
  stop();
  registry.stop();
  await opened.close();
});

describe('listening state signals', () => {
  it('stay quiet for the sources that exist when the hub starts', () => {
    device('computer', 'Desk');
    open();
    expect(heard).toHaveLength(0);
  });

  it('announce a new computer as listening and a switched-off one as off', async () => {
    open();
    const desk = device('computer', 'Desk');
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      kind: 'state',
      subject: desk,
      value: 'on',
      previous: null,
      data: { state: 'on', source: 'computer', reason: null, name: 'Desk' },
    });
    await registry.change(owner, desk, { wake: false });
    expect(heard[1]).toMatchObject({ value: 'off', previous: 'on' });
  });

  it('name the pause reason when a conversation or a Discord call takes the microphone', () => {
    const desk = device('computer', 'Desk');
    open();
    registry.setState(desk, 'in_conversation');
    registry.setState(desk, 'discord_call');
    registry.setState(desk, null);
    expect(values()).toStrictEqual(['paused:in_call', 'paused:discord_call', 'on']);
    expect(heard[1]).toMatchObject({
      previous: 'paused:in_call',
      data: { state: 'paused', reason: 'discord_call' },
    });
  });

  it('report a lost microphone permission and a missing host', () => {
    const desk = device('computer', 'Desk');
    open();
    registry.setState(desk, 'needs_permission');
    registry.setState(desk, 'no_host');
    expect(values()).toStrictEqual(['mic_permission_lost', 'no_host']);
  });

  it('report a used-up transcript budget while the ear keeps listening', async () => {
    const desk = device('computer', 'Desk');
    open();
    await registry.change(owner, desk, { transcribe: true });
    registry.setPaused(desk, 'cap_reached');
    registry.setPaused(desk, null);
    expect(values()).toStrictEqual(['budget_used_up', 'on']);
  });

  it('say nothing when only a switch that does not move the state changes', async () => {
    const desk = device('computer', 'Desk');
    open();
    await registry.change(owner, desk, { sensitivity: 'high' });
    expect(heard).toHaveLength(0);
  });

  it('carry the person of a phone so a member sees only their own', async () => {
    const phone = device('phone', 'Pixel', { profileId: PERSON });
    open();
    await registry.change(owner, phone, { wake: true });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ subject: phone, value: 'on', profileId: PERSON });
  });

  it('never carry what was said', () => {
    const desk = device('computer', 'Desk');
    open();
    registry.setState(desk, 'in_conversation');
    expect(Object.keys(heard[0]?.data ?? {}).sort()).toStrictEqual([
      'name',
      'reason',
      'source',
      'state',
    ]);
  });
});
