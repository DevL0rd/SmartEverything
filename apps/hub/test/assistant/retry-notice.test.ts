import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CHAT_ACTIVITY_NOTICE, CHAT_RETRYING_REASON } from '@smarteverything/domain';
import { retryNotice } from '../../src/assistant/retry-notice';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';

const event: StoredEvent = {
  cursor: 1,
  id: randomUUID(),
  kind: 'chat',
  chat_id: randomUUID(),
  message_id: randomUUID(),
  profile_id: randomUUID(),
  client_id: null,
  text: 'hello',
  report_to: null,
  hops: 0,
  received_at: '2026-01-01T00:00:00.000Z',
  delivered_at: null,
  answered_at: null,
};

describe('the retry notice', () => {
  it('is a valid thinking notice carrying the retrying reason', () => {
    const notice = retryNotice(event, true);
    expect(CHAT_ACTIVITY_NOTICE.parse(notice)).toMatchObject({
      state: 'thinking',
      reason: CHAT_RETRYING_REASON,
      messageId: event.message_id,
      turnId: event.id,
    });
  });

  it('clears into an idle notice that outranks the retrying one', () => {
    const cleared = retryNotice(event, false);
    expect(CHAT_ACTIVITY_NOTICE.parse(cleared)).toMatchObject({ state: 'idle', reason: null });
    expect(cleared.seq).toBeGreaterThan(retryNotice(event, true).seq);
  });
});
