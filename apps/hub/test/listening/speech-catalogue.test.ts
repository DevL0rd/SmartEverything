import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ListeningRegistry } from '../../src/listening/listening-registry';
import { ReachRules } from '../../src/reach/reach-rules';
import type { Caller } from '../../src/server/auth';
import { readableSpeechSources } from '../../src/transcripts/speech-catalogue';
import { speechPrincipal } from '../../src/transcripts/speech-principal';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let registry: ListeningRegistry;
let owner: Caller;
let member: Caller;
let memberProfile: string;

function device(kind: 'camera' | 'phone' | 'computer', name: string, profileId?: string): string {
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
      details: profileId === undefined ? {} : { profileId },
    },
  ]);
  return row?.id ?? '';
}

beforeEach(async () => {
  opened = await testStore();
  const rules = new ReachRules(opened.store, () => new Date());
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
  const ownerRow = opened.store.clients.create({
    name: 'Owner',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  const memberRow = opened.store.clients.create({
    name: 'Member',
    platform: 'android',
    role: 'member',
    tokenHash: 'b'.repeat(64),
  });
  owner = { kind: 'client', client: ownerRow };
  member = { kind: 'client', client: memberRow };
  memberProfile = opened.store.profiles.activeOf(memberRow.id).id;
});

afterEach(async () => {
  registry.stop();
  await opened.close();
});

describe('the speech source catalogue', () => {
  it('lists phones and computers with their listening state, and a member only their own', async () => {
    const mine = device('phone', 'Mine', memberProfile);
    device('phone', 'Theirs', crypto.randomUUID());
    const desk = device('computer', 'Desk');
    const all = await readableSpeechSources(
      opened.store,
      speechPrincipal(opened.store, owner),
      registry,
    );
    expect(all.sources.map((entry) => entry.source)).toEqual(
      expect.arrayContaining([
        { kind: 'phone', deviceId: mine },
        { kind: 'computer', deviceId: desk },
      ]),
    );
    expect(all.sources.find((entry) => entry.label === 'Desk')?.listening).toEqual({
      wake: true,
      transcribe: false,
      state: 'listening',
    });
    const own = await readableSpeechSources(
      opened.store,
      speechPrincipal(opened.store, member),
      registry,
    );
    expect(own.sources.map((entry) => entry.label)).toEqual(['Mine']);
  });
});
