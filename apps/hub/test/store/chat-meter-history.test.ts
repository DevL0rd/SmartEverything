import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  USAGE_SERIES_POINTS_MAX,
  type AiChatRow,
  type AiUsageRow,
  type ClientRow,
} from '@smarteverything/domain';
import { AssistantService } from '../../src/assistant/service';
import { aiChatRoutes } from '../../src/server/handlers/ai-chats';
import { openStore } from '../../src/store/store';
import { TEST_ENGINE } from '../support/engine';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore, unusedDrivePath } from '../support/store';
import { hubLayout } from '../../src/data-layout';

const START = '2026-11-05T06:00:00.000Z';
const NEXT = '2026-11-05T06:10:00.000Z';
const LATER = '2026-11-05T07:00:00.001Z';

let clock: string;
let opened: TestStore;
let client: ClientRow;
let chat: AiChatRow;

const now = (): Date => new Date(clock);

function createChat(profileId: string): AiChatRow {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Planning',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
}

function usage(input: number, cached: number): AiUsageRow {
  return opened.store.ledger.record({
    profile_id: chat.profile_id,
    chat_id: chat.id,
    source: 'openrouter',
    work: 'chat',
    tokens_in: input,
    tokens_cached: cached,
    cost_micros: 0,
    cost_state: 'reported',
  });
}

beforeEach(async () => {
  captureLogs();
  clock = START;
  opened = await testStore(now);
  const { store } = opened;
  client = store.clients.create(
    { name: 'Paired phone', platform: 'android', role: 'member', tokenHash: 'test' },
    false,
  );
  chat = createChat(store.profiles.create({ name: 'Pat' }).id);
});

afterEach(async () => {
  await opened.close();
});

describe('chat meter history', () => {
  it('persists only changes in measured context and cache across database connections', () => {
    const { aiChats, ledger } = opened.store;
    aiChats.noteContext(chat.id, 27);
    usage(100, 0);
    aiChats.noteContext(chat.id, 27);
    aiChats.noteCacheReads(chat.id, 100, 50);
    clock = NEXT;
    const row = usage(300, 150);
    ledger.amend(row.id, { cost_micros: 300 });
    ledger.reconcile(row.id, { tokens_cached: 100, cost_micros: 500 });
    aiChats.noteContext(chat.id, 12);
    aiChats.noteContext(chat.id, null);

    const reader = openStore({
      path: join(opened.directory, 'test.db'),
      log: testLogger('store'),
      now,
      systemTimeZone: 'UTC',
      drivePathOf: unusedDrivePath,
    });
    try {
      expect(reader.aiChats.meterHistory(chat.id)).toStrictEqual([
        { at: START, kind: 'context', percent: 27 },
        { at: START, kind: 'cache', percent: 0 },
        { at: NEXT, kind: 'cache', percent: 37 },
        { at: NEXT, kind: 'cache', percent: 25 },
        { at: NEXT, kind: 'context', percent: 12 },
      ]);
      expect(reader.aiChats.chat(chat.id).cache_percent).toBe(25);
    } finally {
      reader.close();
    }
  });

  it('shows at most the last hour and cascades the deletion to samples', () => {
    const { aiChats } = opened.store;
    aiChats.noteContext(chat.id, 10);
    clock = NEXT;
    aiChats.noteContext(chat.id, 15);
    clock = LATER;
    expect(aiChats.meterHistory(chat.id)).toStrictEqual([
      { at: NEXT, kind: 'context', percent: 15 },
    ]);
    aiChats.remove(chat.id);
    expect(aiChats.meterHistory(chat.id)).toStrictEqual([]);
  });

  it('bounds an oversized supplier cache ratio while preserving the raw ledger reading', () => {
    const { aiChats, ledger } = opened.store;
    const row = usage(100, 40);
    clock = NEXT;
    ledger.reconcile(row.id, { tokens_cached: 140, cost_micros: 500 });

    expect(ledger.get(row.id)).toMatchObject({ tokens_in: 100, tokens_cached: 140 });
    expect(aiChats.chat(chat.id).cache_percent).toBe(100);
    expect(aiChats.meterHistory(chat.id)).toStrictEqual([
      { at: START, kind: 'cache', percent: 40 },
      { at: NEXT, kind: 'cache', percent: 100 },
    ]);
  });

  it('keeps the most recent series within the usage chart point limit during a burst', () => {
    const { aiChats } = opened.store;
    aiChats.noteContext(chat.id, 1);
    usage(100, 50);
    clock = NEXT;
    for (let index = 0; index < USAGE_SERIES_POINTS_MAX; index += 1)
      aiChats.noteContext(chat.id, (index % 2) + 2);

    const samples = aiChats.meterHistory(chat.id);
    expect(samples).toHaveLength(USAGE_SERIES_POINTS_MAX + 1);
    expect(samples[0]).toStrictEqual({ at: START, kind: 'cache', percent: 50 });
    expect(samples[1]).toStrictEqual({ at: NEXT, kind: 'context', percent: 2 });
  });

  it('serves the requested chat and refuses a different person’s chat', async () => {
    const { store } = opened;
    const assistant = new AssistantService({
      store,
      layout: hubLayout(opened.directory, {}),
      announce: (): void => undefined,
      emit: (): void => undefined,
      now,
      log: testLogger('assistant'),
    });
    try {
      store.aiChats.noteContext(chat.id, 10);
      const own = createChat(chat.profile_id);
      const stranger = createChat(store.profiles.create({ name: 'Sam' }).id);
      const harness = { routes: { supplierRoute: (): undefined => undefined } };
      const route = aiChatRoutes({ store, assistant, harness }).readAiChatMeterHistory;
      const read = (chatId: string): Promise<unknown> =>
        route.run(
          { kind: 'client', client, profileId: chat.profile_id },
          { params: { chatId }, query: {}, body: undefined, remote: 'test', headers: {} },
          testLogger(),
        );
      expect(API_ENDPOINTS.readAiChatMeterHistory.response.parse(await read(chat.id))).toEqual([
        { at: START, kind: 'context', percent: 10 },
      ]);
      await expect(read(own.id)).resolves.toStrictEqual([]);
      await expect(read(stranger.id)).rejects.toMatchObject({ code: 'forbidden' });
    } finally {
      assistant.stop();
    }
  });
});
