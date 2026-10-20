import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { AI_CHAT_ROW, type AiChatRow, type LiveChange } from '@smarteverything/domain';
import { applyToWindows } from './live-invalidations';
import { nativeSessionsKey } from './keys';

const DEVICE = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';

function chat(engine: object, archivedAt: string | null, title = 'Plan'): AiChatRow {
  return AI_CHAT_ROW.parse({
    id: '11111111-1111-4111-8111-111111111111',
    profile_id: '22222222-2222-4222-8222-222222222222',
    kind: 'chat',
    title,
    icon: null,
    parent_id: null,
    source_key: null,
    engine,
    tools: null,
    pinned: false,
    archived_at: archivedAt,
    cost_micros: 0,
    last_message_at: '2026-10-17T10:00:00.000Z',
    created_at: '2026-10-17T09:00:00.000Z',
    updated_at: '2026-10-17T10:00:00.000Z',
  });
}

const CONTINUING = { kind: 'claude', device_id: DEVICE, model: 'opus', continued_from: SESSION };
const PLAIN = { kind: 'claude', device_id: DEVICE, model: 'opus' };
const ARCHIVED_AT = '2026-10-17T11:00:00.000Z';

function change(
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  record: AiChatRow | null,
  oldRecord: AiChatRow | null,
): LiveChange {
  return { type: 'change', table: 'ai_chats', operation, record, oldRecord, seq: 1 };
}

function primed(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(nativeSessionsKey(DEVICE, false), []);
  client.setQueryData(nativeSessionsKey(DEVICE, true), []);
  client.setQueryData(nativeSessionsKey(OTHER, false), []);
  return client;
}

function stale(client: QueryClient, deviceId: string, archived: boolean): boolean | undefined {
  return client.getQueryState(nativeSessionsKey(deviceId, archived))?.isInvalidated;
}

describe('the Desktop session lists follow chats that continue a session', () => {
  it('fetches that computer again when an archived continuing chat is deleted', () => {
    const client = primed();
    applyToWindows(client, [change('DELETE', null, chat(CONTINUING, ARCHIVED_AT))]);
    expect(stale(client, DEVICE, false)).toBe(true);
    expect(stale(client, DEVICE, true)).toBe(false);
    expect(stale(client, OTHER, false)).toBe(false);
  });

  it('fetches again when a continuing chat is archived or unarchived', () => {
    const archived = primed();
    applyToWindows(archived, [
      change('UPDATE', chat(CONTINUING, ARCHIVED_AT), chat(CONTINUING, null)),
    ]);
    expect(stale(archived, DEVICE, false)).toBe(true);
    const restored = primed();
    applyToWindows(restored, [
      change('UPDATE', chat(CONTINUING, null), chat(CONTINUING, ARCHIVED_AT)),
    ]);
    expect(stale(restored, DEVICE, false)).toBe(true);
  });

  it('leaves the lists alone for other chat changes', () => {
    const client = primed();
    applyToWindows(client, [
      change('UPDATE', chat(CONTINUING, null, 'Renamed'), chat(CONTINUING, null)),
      change('DELETE', null, chat(PLAIN, ARCHIVED_AT)),
      change('UPDATE', chat(PLAIN, ARCHIVED_AT), chat(PLAIN, null)),
    ]);
    expect(stale(client, DEVICE, false)).toBe(false);
  });
});
