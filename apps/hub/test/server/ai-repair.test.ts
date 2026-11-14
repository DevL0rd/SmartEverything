import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AI_REPAIR_PAGE,
  RUNTIME_LOG_BATCH,
  type AiRepairGroup,
  type AiChatRow,
  type ClientRow,
  type RuntimeLogRecord,
} from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { aiRepairRoutes } from '../../src/server/handlers/ai-repair';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { RepairDispatch } from '../../src/assistant/repair-dispatch';
import { startRepair } from '../../src/server/repair-wiring';
import { hubLayout } from '../../src/data-layout';
import { repairEventId } from '../../src/assistant/repair-dispatch';
import type { Bound } from '../../src/server/router';
import type {
  LogSourceInfo,
  StoredLogRecord,
} from '../../src/store/repositories/runtime-log-types';
import { openStore } from '../../src/store/store';
import { TEST_ENGINE } from '../support/engine';
import { testLogger } from '../support/logs';
import { testStore, type TestStore, unusedDrivePath } from '../support/store';

const NOW = '2026-11-05T10:00:00.000Z';
const EARLIER = '2026-11-05T09:59:00.000Z';
const log = testLogger('ai-repair');

let opened: TestStore;
let owner: ClientRow;
let member: ClientRow;
let routes: ReturnType<typeof aiRepairRoutes>;

beforeEach(async () => {
  opened = await testStore(() => new Date(NOW));
  const { clients } = opened.store;
  owner = clients.create(
    { name: 'Owner', platform: 'android', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  member = clients.create(
    { name: 'Member', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
    false,
  );
  routes = aiRepairRoutes(opened.store);
});

afterEach(async () => {
  await opened.close();
});

function call(route: Bound, client: ClientRow, query = {}, body?: unknown): Promise<unknown> {
  return route.run(
    { kind: 'client', client },
    { params: {}, query, body, remote: 'test', headers: {} },
    log,
  );
}

function record(
  message: string,
  timestamp = NOW,
  level: RuntimeLogRecord['level'] = 'error',
): RuntimeLogRecord {
  return {
    timestamp,
    level,
    runtime: 'app',
    platform: 'android',
    scope: 'app.sync',
    event: 'request.failed',
    payload: {},
    failure: { name: 'SyncError', message },
  };
}

function ingest(client: ClientRow, ...records: readonly RuntimeLogRecord[]): number {
  const source: LogSourceInfo = {
    source: `app:${client.id}`,
    runtime: 'app',
    platform: 'android',
    deviceId: client.id,
    clientId: opened.store.profiles.activeOf(client.id).id,
  };
  return opened.store.runtimeLogs.ingest({
    access: { owner: client.role === 'owner', profileId: source.clientId },
    batch: RUNTIME_LOG_BATCH.parse({ records }),
    source,
    deviceId: client.id,
    now: NOW,
  }).accepted;
}

it('defaults off and allows only the paired owner to change the setting', async () => {
  await expect(call(routes.readAiRepairSettings, owner)).resolves.toEqual({ enabled: false });
  await expect(call(routes.readAiRepairSettings, member)).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(
    call(routes.updateAiRepairSettings, member, {}, { enabled: true }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    routes.updateAiRepairSettings.run(
      { kind: 'client', client: owner, via: 'assistant' },
      { params: {}, query: {}, body: { enabled: true }, remote: 'test', headers: {} },
      log,
    ),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(call(routes.updateAiRepairSettings, owner, {}, { enabled: true })).resolves.toEqual({
    enabled: true,
  });
  await expect(call(routes.readAiRepairSettings, owner)).resolves.toEqual({ enabled: true });
});

it('groups accepted owner errors, retains distinct failures at the same moment, and ignores replays', async () => {
  const timeout = record('Request 1 timed out');
  const refused = record('Connection refused');
  expect(ingest(owner, timeout, refused)).toBe(2);
  expect(ingest(owner, timeout, refused)).toBe(0);
  expect(ingest(owner, record('Request 2 timed out', EARLIER))).toBe(1);
  expect(ingest(owner, record('Warning', NOW, 'warn'))).toBe(1);
  expect(ingest(member, record('Member private failure'))).toBe(1);

  const first = AI_REPAIR_PAGE.parse(await call(routes.listAiRepairGroups, owner, { limit: 1 }));
  expect(first.groups).toHaveLength(1);
  expect(first.next).not.toBeNull();
  const second = AI_REPAIR_PAGE.parse(
    await call(routes.listAiRepairGroups, owner, first.next ?? {}),
  );
  expect(second.groups).toHaveLength(1);
  expect(second.next).toBeNull();
  const groups = [...first.groups, ...second.groups];
  expect(groups).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        component: 'app.sync',
        firstAt: EARLIER,
        lastAt: NOW,
        observations: 2,
      }),
      expect.objectContaining({
        component: 'app.sync',
        firstAt: NOW,
        lastAt: NOW,
        observations: 1,
      }),
    ]),
  );
  const repeated = groups.find((group) => group.observations === 2);
  const evidence = opened.store.runtimeLogs.around(
    { owner: true, profileId: owner.id },
    { id: repeated?.latestLogId ?? 0, before: 0, after: 0 },
  );
  expect(evidence?.anchor.at).toBe(NOW);
  await expect(call(routes.listAiRepairGroups, member)).rejects.toMatchObject({
    code: 'forbidden',
  });
});

it('keeps its grouped evidence across an independent database open and clears removed log links', () => {
  expect(ingest(owner, record('Request timed out'))).toBe(1);
  opened.store.runtimeLogs.drop({ owner: true, profileId: owner.id }, undefined);
  const reader = openStore({
    path: join(opened.directory, 'test.db'),
    log,
    now: () => new Date(NOW),
    systemTimeZone: 'UTC',
    drivePathOf: unusedDrivePath,
  });
  try {
    expect(reader.aiRepairInbox.list({ limit: 100 }).groups).toMatchObject([
      { observations: 1, latestLogId: null },
    ]);
    expect(reader.settingsKv.read('ai-repair')).toBeNull();
  } finally {
    reader.close();
  }
});

it('offers every committed owner error until the first automatic admission', async () => {
  const { store } = opened;
  let accept = false;
  const observed = vi.fn((_log: StoredLogRecord, fingerprint: string): void => {
    if (accept)
      store.write(() => {
        store.aiRepairInbox.markAutomaticAdmitted(fingerprint);
      });
  });
  const stop = opened.store.runtimeLogs.onRepairEvidence(observed);
  const crash = {
    ...record('App crashed', NOW, 'exception'),
    event: 'error.uncaught',
    scope: 'app.crash-guard',
  };
  expect(() =>
    opened.store.write(() => {
      expect(ingest(owner, crash)).toBe(1);
      throw new Error('Rolled back');
    }),
  ).toThrow('Rolled back');
  await Promise.resolve();
  expect(observed).not.toHaveBeenCalled();
  expect(ingest(member, crash)).toBe(1);
  expect(ingest(owner, record('Other owner error'))).toBe(1);
  expect(ingest(owner, crash)).toBe(1);
  expect(ingest(owner, crash)).toBe(0);
  await Promise.resolve();
  expect(observed).toHaveBeenCalledTimes(2);
  expect(observed).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'app.crash-guard', source: `app:${owner.id}` }),
    expect.stringMatching(/^[a-f\d]{64}$/u),
  );
  accept = true;
  expect(ingest(owner, { ...crash, timestamp: EARLIER })).toBe(1);
  await Promise.resolve();
  expect(observed).toHaveBeenCalledTimes(3);
  expect(ingest(owner, { ...crash, timestamp: '2026-11-05T10:00:01.000Z' })).toBe(1);
  await Promise.resolve();
  expect(observed).toHaveBeenCalledTimes(3);
  stop();
});

it('answers a repeated manual request even after its log evidence is purged', async () => {
  const { store } = opened;
  expect(ingest(owner, record('Request failed'))).toBe(1);
  const group = store.aiRepairInbox.list({ limit: 1 }).groups[0];
  if (group === undefined) throw new Error('Expected a retained group.');
  const requestId = randomUUID();
  const eventId = repairEventId(group.fingerprint, requestId);
  const chatId = randomUUID();
  const existing = vi.fn(() => ({ kind: 'existing', eventId, chatId }) as const);
  const admit = vi.fn();
  const { diagnoseAiRepairGroup } = aiRepairRoutes(store, {
    admit,
    existing,
    available: () => true,
  });
  store.runtimeLogs.drop({ owner: true, profileId: owner.id }, undefined);
  await expect(
    diagnoseAiRepairGroup.run(
      { kind: 'client', client: owner, profileId: owner.id },
      {
        params: { fingerprint: group.fingerprint },
        query: {},
        body: { requestId },
        remote: 'test',
        headers: {},
      },
      log,
    ),
  ).resolves.toEqual({ kind: 'existing', eventId, chatId });
  expect(existing).toHaveBeenCalledExactlyOnceWith(eventId, owner.id);
  expect(admit).not.toHaveBeenCalled();
});

function observedGroup(message: string): AiRepairGroup {
  expect(ingest(owner, record(message))).toBe(1);
  const group = opened.store.aiRepairInbox.list({ limit: 1 }).groups[0];
  if (group === undefined) throw new Error('Expected an error group.');
  return group;
}

function addInvestigation(fingerprint: string): {
  readonly chatId: string;
  readonly eventId: string;
} {
  const { store } = opened;
  const profileId = store.profiles.first().id;
  const { id: chatId } = store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'AI repair',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
  const { id: eventId } = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'wake',
    chat_id: chatId,
    message_id: null,
    profile_id: profileId,
    client_id: null,
    text: 'Fixture repair',
  });
  store.aiRepairInbox.recordAdmission(fingerprint, { kind: 'queued', eventId, chatId });
  return { chatId, eventId };
}

it('dismisses only the observed version of an error and keeps its diagnostic evidence', async () => {
  const { store } = opened;
  const { fingerprint, observations, latestLogId } = observedGroup('Request failed');
  const dismissal = { kind: 'group', fingerprint, observations };
  await expect(call(routes.dismissAiRepairGroups, member, {}, dismissal)).rejects.toMatchObject({
    code: 'forbidden',
  });
  store.aiRepairInbox.markAutomaticAdmitted(fingerprint);
  await expect(call(routes.dismissAiRepairGroups, owner, {}, dismissal)).resolves.toEqual({
    dismissed: 1,
  });
  expect(store.aiRepairInbox.list({ limit: 1 }).groups).toEqual([]);
  expect(store.aiRepairInbox.mayAutoAdmit(fingerprint)).toBe(false);
  expect(
    store.runtimeLogs.around(
      { owner: true, profileId: owner.id },
      { id: latestLogId ?? 0, before: 0, after: 0 },
    )?.anchor.id,
  ).toBe(latestLogId);

  expect(ingest(owner, record('Request failed', EARLIER))).toBe(1);
  await expect(call(routes.dismissAiRepairGroups, owner, {}, dismissal)).resolves.toEqual({
    dismissed: 0,
  });
  expect(store.aiRepairInbox.list({ limit: 1 }).groups).toMatchObject([
    { fingerprint, observations: 2 },
  ]);
});

it('clears inactive groups while leaving queued and running work visible and intact', async () => {
  const { store } = opened;
  const group = observedGroup('Needs repair');
  const { chatId, eventId } = addInvestigation(group.fingerprint);
  expect(ingest(owner, record('Discarded error', EARLIER))).toBe(1);
  const page = AI_REPAIR_PAGE.parse(await call(routes.listAiRepairGroups, owner, { limit: 1 }));
  expect(page).toMatchObject({
    groups: [{ fingerprint: group.fingerprint, progress: 'queued' }],
    next: { fingerprint: group.fingerprint, lastAt: NOW },
  });
  expect(Object.keys(page).sort()).toEqual(['automaticHold', 'groups', 'next']);
  const clear = (): Promise<unknown> =>
    call(routes.dismissAiRepairGroups, owner, {}, { kind: 'inactive' });

  await expect(clear()).resolves.toEqual({ dismissed: 1 });
  expect(store.aiRepairInbox.list({ limit: 2 }).groups).toMatchObject([
    { fingerprint: group.fingerprint, progress: 'queued' },
  ]);
  store.assistantEvents.mark(eventId, 'delivered_at');
  await expect(clear()).resolves.toEqual({ dismissed: 0 });
  expect(store.aiRepairInbox.list({ limit: 2 }).groups).toMatchObject([{ progress: 'running' }]);

  store.aiRepairInbox.markFailed(eventId);
  await expect(clear()).resolves.toEqual({ dismissed: 0 });
  store.assistantEvents.mark(eventId, 'answered_at');
  await expect(clear()).resolves.toEqual({ dismissed: 1 });
  expect(store.aiRepairInbox.list({ limit: 2 }).groups).toEqual([]);
  expect(store.aiChats.find(chatId)?.id).toBe(chatId);
  expect(store.assistantEvents.find(eventId)?.id).toBe(eventId);
});

it('recovers visible unadmitted and legacy held errors once at startup without replaying admitted groups', async () => {
  const { store } = opened;
  store.settingsKv.save('ai-repair', { enabled: true });
  store.settingsKv.save('ai-repair-enabled-at', { at: EARLIER });
  const held = observedGroup('Legacy held work');
  store.aiRepairInbox.recordAdmission(held.fingerprint, { kind: 'held', reason: 'budget' });
  store.aiRepairInbox.markAutomaticAdmitted(held.fingerprint);
  const profileId = store.profiles.activeOf(owner.id).id;
  const chat = store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'AI repair',
    icon: null,
    parentId: null,
    sourceKey: 'repair:server\0hub:service',
    engine: TEST_ENGINE,
  });
  const repair = new RepairDispatch({
    store,
    conversation: new ConversationLog(store),
    repairChat: (): AiChatRow => chat,
    added: (): undefined => undefined,
  });
  const context = { store, log, assistant: { repair } };
  const layout = hubLayout(opened.directory, {});
  let stop = startRepair(context, layout);
  expect(store.assistantEvents.pending()).toHaveLength(1);
  expect(store.assistantEvents.pending()[0]?.chat_id).toBe(chat.id);
  stop();
  stop = startRepair(context, layout);
  expect(store.assistantEvents.pending()).toHaveLength(1);
  for (let index = 0; index < 216; index += 1)
    ingest(owner, record('Legacy held work', new Date(Date.parse(NOW) + index + 1).toISOString()));
  await Promise.resolve();
  expect(store.assistantEvents.pending()).toHaveLength(1);
  expect(ingest(owner, { ...record('New error during repair'), event: 'arbitrary.failed' })).toBe(
    1,
  );
  await Promise.resolve();
  expect(store.assistantEvents.pending()).toHaveLength(2);
  expect(store.assistantEvents.pending().every((event) => event.chat_id === chat.id)).toBe(true);
  stop();
});
