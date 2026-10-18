import { LIVE_MESSAGE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { readLeniently } from '../api/connection/readable';

const CHAT = '00000000-0000-4000-8000-000000000001';
const TURN = '00000000-0000-4000-8000-000000000002';

describe('LIVE_MESSAGE', () => {
  it('reads a row change', () => {
    const read = readLeniently(LIVE_MESSAGE, {
      type: 'change',
      table: 'device_state',
      operation: 'UPDATE',
      seq: 4,
      oldRecord: null,
      record: {
        device_id: CHAT,
        capability: 'power',
        value: true,
        observed_at: '2026-10-17T10:00:00.000Z',
      },
    });
    expect(read.ok).toBe(true);
  });

  it('reads notices by their type', () => {
    const stream = readLeniently(LIVE_MESSAGE, {
      type: 'chat_stream',
      chatId: CHAT,
      turnId: TURN,
      seq: 1,
      parts: [{ kind: 'text', delta: 'hi' }],
    });
    const log = readLeniently(LIVE_MESSAGE, { type: 'service_log', lines: ['a'] });
    expect(stream.ok && stream.data.type).toBe('chat_stream');
    expect(log.ok && log.data.type).toBe('service_log');
  });

  it('ignores fields a newer server adds to a notice', () => {
    const read = readLeniently(LIVE_MESSAGE, { type: 'service_log', lines: ['a'], extra: 1 });
    expect(read.ok && read.ignored).toEqual(['extra']);
  });

  it('refuses an unknown type', () => {
    expect(readLeniently(LIVE_MESSAGE, { type: 'nothing_known' }).ok).toBe(false);
  });
});
