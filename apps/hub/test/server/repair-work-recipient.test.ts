import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repairWorkRecipient } from '../../src/assistant/repair-work-recipient';
import { saveRepairWorkClaim } from '../../src/store/repositories/repair-work-claims';
import { repairObservation } from '../../src/store/repositories/repair-fingerprint';
import type { StoredLogRecord } from '../../src/store/repositories/runtime-log-types';
import { TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';

const CLAIMED = '2026-10-08T10:00:00.000Z';
const LOGGED = '2026-10-08T11:00:00.000Z';

const HUB_ERROR: StoredLogRecord = {
  at: LOGGED,
  recordedAt: LOGGED,
  source: 'hub:service',
  runtime: 'hub',
  platform: 'server',
  deviceId: null,
  clientId: null,
  scope: 'hub.service',
  event: 'service.fatal',
  level: 'exception',
  payload: {},
  failure: { name: 'Error', message: 'fixture' },
  durationMs: null,
};

let fixture: TestStore;

beforeEach(async () => {
  fixture = await testStore();
});

afterEach(async () => {
  await fixture.close();
});

function chatIdFor(profileId: string): string {
  return fixture.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Repair fixture',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  }).id;
}

describe('repair work claims', () => {
  it('matches trusted component evidence and falls back to previous work after archive', () => {
    const { store } = fixture;
    const profileId = store.profiles.first().id;
    const previous = chatIdFor(profileId);
    const latest = chatIdFor(profileId);
    saveRepairWorkClaim(
      store.settingsKv,
      { profileId, chatId: previous, component: 'hub.service' },
      new Date(CLAIMED),
    );
    const claim = saveRepairWorkClaim(
      store.settingsKv,
      { profileId, chatId: latest, component: 'hub.service' },
      new Date(LOGGED),
    );
    expect(repairWorkRecipient(store, HUB_ERROR)).toEqual({
      origin: { profileId, chatId: latest },
      expiresAt: claim.expiresAt,
    });
    expect(repairWorkRecipient(store, { ...HUB_ERROR, at: CLAIMED })?.origin.chatId).toBe(previous);
    expect(
      repairWorkRecipient(store, { ...HUB_ERROR, source: 'hub:startup-journal' }),
    ).toBeUndefined();
    store.aiChats.update(latest, { archived: true });
    expect(repairWorkRecipient(store, HUB_ERROR)?.origin.chatId).toBe(previous);
  });

  it('uses the actual app source and current profile and keeps device groups independent', () => {
    const { store } = fixture;
    const profileId = store.profiles.first().id;
    const client = store.clients.create({
      name: 'Owner phone',
      platform: 'android',
      role: 'owner',
      tokenHash: 'a'.repeat(64),
    });
    const chatId = chatIdFor(profileId);
    const component = `app:${client.id}` as const;
    saveRepairWorkClaim(store.settingsKv, { profileId, chatId, component }, new Date(CLAIMED));
    const error = {
      ...HUB_ERROR,
      source: component,
      scope: 'app.crash-guard',
      event: 'error.uncaught',
      clientId: profileId,
      deviceId: client.id,
    };
    const other = { ...error, source: 'app:72802ea9-0e8b-4a7a-bb8f-edca1c59f0ef' };
    expect(repairWorkRecipient(store, error)?.origin.chatId).toBe(chatId);
    expect(repairWorkRecipient(store, { ...error, clientId: null })).toBeUndefined();
    expect(repairWorkRecipient(store, other)).toBeUndefined();
    expect(repairObservation(error)?.fingerprint).not.toBe(repairObservation(other)?.fingerprint);
  });
});
