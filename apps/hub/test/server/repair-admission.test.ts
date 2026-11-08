import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AiChatRow } from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { AssistantFiles } from '../../src/assistant/files';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { RepairDispatch } from '../../src/assistant/repair-dispatch';
import { startRepair } from '../../src/server/repair-wiring';
import { runtimeLogRoutes } from '../../src/server/handlers/runtime-logs';
import { hubLogSink } from '../../src/server/hub-log-sink';
import { testStore, type TestStore } from '../support/store';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { testLogger } from '../support/logs';

const NOW = '2026-10-08T10:00:00.000Z';
let opened: TestStore;
let stop: () => void;

beforeEach(async () => {
  Logger.reset();
  opened = await testStore(() => new Date(NOW));
  opened.store.clients.create(
    { name: 'Owner', platform: 'android', role: 'owner', tokenHash: 'owner' },
    true,
  );
  opened.store.settingsKv.save('ai-repair', { enabled: true });
  opened.store.settingsKv.save('ai-repair-enabled-at', { at: NOW });
  stop = (): undefined => undefined;
});

afterEach(async () => {
  stop();
  Logger.reset();
  await opened.close();
});

function directory(): ChatDirectory {
  return new ChatDirectory(
    opened.store,
    new AssistantFiles({
      layout: opened.layout,
      chat: opened.store.assistantChat,
      now: () => new Date(NOW),
    }),
  );
}

function start(chats: ChatDirectory): void {
  const repair = new RepairDispatch({
    store: opened.store,
    conversation: new ConversationLog(opened.store),
    repairChat: (profileId): AiChatRow => chats.repairChat(profileId),
    added: (): undefined => undefined,
  });
  stop = startRepair(
    { store: opened.store, log: testLogger('repair'), assistant: { repair } },
    opened.layout,
  );
}

it('routes app evidence by its authenticated profile identity with two owners', async () => {
  const { store } = opened;
  const profile = store.profiles.create({ name: 'Other owner' });
  store.personAccess.change(profile.id, { role: 'owner' });
  const client = store.clients.create({
    name: 'Other phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'other',
    profileId: profile.id,
  });
  const chats = directory();
  start(chats);
  const routes = runtimeLogRoutes({ store }, () => new Date(NOW));
  await routes.ingestRuntimeLogs.run(
    { kind: 'client', client, profileId: profile.id },
    {
      params: {},
      query: {},
      remote: 'test',
      headers: {},
      body: {
        clientId: client.id,
        profileId: profile.id,
        records: [
          {
            timestamp: NOW,
            level: 'error',
            runtime: 'app',
            platform: 'android',
            scope: 'app.sync',
            event: 'request.failed',
            payload: {},
            failure: { name: 'Error', message: 'Other owner error' },
          },
        ],
      },
    },
    testLogger('test'),
  );
  await Promise.resolve();
  const events = store.assistantEvents.pending();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    profile_id: profile.id,
    chat_id: chats.repairChat(profile.id).id,
  });
  expect(store.aiChats.chat(events[0]?.chat_id ?? '').profile_id).toBe(profile.id);
});

it('retains failed automatic attempts finitely and retries only after a committed configuration fix', async () => {
  const { store } = opened;
  store.aiEngineDefaults.update(CLAUDE_TEST_ENGINE);
  const chats = directory();
  const records: LogRecord[] = [];
  const failed = vi.fn();
  const owned = hubLogSink({ store, failed });
  let sequence = 0;
  Logger.configure({
    level: 'error',
    now: () => new Date(Date.parse(NOW) + sequence++),
    sink: (record) => {
      records.push(record);
      owned.sink(record);
    },
  });
  start(chats);
  testLogger('sample').error('request.failed', new Error('Initial application error'));
  for (let turn = 0; turn < 6; turn += 1) {
    owned.flush();
    await Promise.resolve();
  }
  expect(failed).not.toHaveBeenCalled();
  expect(records.filter((record) => record.event === 'repair.admission_failed')).toHaveLength(2);
  expect(store.aiRepairInbox.list({ limit: 10 }).groups).toMatchObject([
    { progress: 'failed', admission: { kind: 'held', reason: 'unavailable' } },
    { progress: 'failed', admission: { kind: 'held', reason: 'unavailable' } },
  ]);
  expect(store.assistantEvents.pending()).toHaveLength(0);
  expect(() =>
    store.write(() => {
      store.aiEngineDefaults.update(TEST_ENGINE);
      throw new Error('Rollback default change');
    }),
  ).toThrow('Rollback default change');
  await Promise.resolve();
  expect(store.assistantEvents.pending()).toHaveLength(0);
  store.aiEngineDefaults.update(CLAUDE_TEST_ENGINE);
  await Promise.resolve();
  expect(records.filter((record) => record.event === 'repair.admission_failed')).toHaveLength(2);
  store.aiEngineDefaults.update(TEST_ENGINE);
  await Promise.resolve();
  expect(store.assistantEvents.pending()).toHaveLength(2);
  const chat = chats.repairChat(store.personAccess.homeOwner());
  expect(store.assistantEvents.pending().every((event) => event.chat_id === chat.id)).toBe(true);
  owned.flush();
  await Promise.resolve();
  expect(records.filter((record) => record.event === 'repair.admission_failed')).toHaveLength(2);
});

it('keeps the durable queued admission when waking delivery fails after enqueue', async () => {
  const { store } = opened;
  const chats = directory();
  const repair = new RepairDispatch({
    store,
    conversation: new ConversationLog(store),
    repairChat: (profileId): AiChatRow => chats.repairChat(profileId),
    added: (): never => {
      throw new Error('Delivery wake failed');
    },
  });
  stop = startRepair({ store, log: testLogger('repair'), assistant: { repair } }, opened.layout);
  const source = {
    source: 'hub:service',
    clientId: 'hub',
    deviceId: null,
    runtime: 'hub' as const,
    platform: 'server' as const,
  };
  store.runtimeLogs.ingest({
    access: { owner: true, profileId: null },
    source,
    deviceId: null,
    now: NOW,
    batch: {
      records: [
        {
          timestamp: NOW,
          level: 'error',
          runtime: 'hub',
          platform: 'server',
          scope: 'hub.test',
          event: 'request.failed',
          payload: {},
          failure: { name: 'Error', message: 'Durable queued work' },
        },
      ],
    },
  });
  await Promise.resolve();
  expect(store.assistantEvents.pending()).toHaveLength(1);
  expect(store.aiRepairInbox.list({ limit: 10 }).groups[0]).toMatchObject({
    progress: 'queued',
    admission: { kind: 'queued' },
  });
});
