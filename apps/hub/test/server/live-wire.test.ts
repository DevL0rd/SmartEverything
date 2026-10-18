import { AI_HARNESS_NOTICE, LIVE_MESSAGE } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { liveText, wireText } from '../../src/server/live-wire';

describe('wireText', () => {
  it('sends a notice that is not a table change as its own JSON', () => {
    const notice = AI_HARNESS_NOTICE.parse({
      type: 'ai_harness',
      event: {
        kind: 'text',
        session_id: 'dsh-session',
        chat_id: crypto.randomUUID(),
        epoch: 1,
        seq: 0,
        delta: 'x'.repeat(16_000),
      },
    });
    expect(wireText(notice)).toBe(JSON.stringify(notice));
  });

  it('leaves the previous plugin stream value off the wire', () => {
    const row = (value: number): object => ({
      plugin_id: 'adguard',
      stream: 'queries',
      value: { rows: Array.from({ length: 50 }, (_, index) => index + value) },
      at: '2026-10-17T00:00:00.000Z',
    });
    const change = LIVE_MESSAGE.parse({
      type: 'change',
      table: 'plugin_streams',
      operation: 'UPDATE',
      seq: 1,
      record: row(1),
      oldRecord: row(0),
    });
    const sent: unknown = JSON.parse(wireText(change));
    expect(sent).toMatchObject({ table: 'plugin_streams', record: row(1), oldRecord: null });
  });
});

describe('liveText', () => {
  const presence = LIVE_MESSAGE.parse({
    type: 'computer_claude',
    device_id: crypto.randomUUID(),
    notice: { type: 'claude_session_gone', id: crypto.randomUUID() },
  });

  it('keeps owner-only notices off a member connection and sends them to an owner', () => {
    expect(liveText('member', presence)).toBeNull();
    expect(liveText('owner', presence)).toBe(JSON.stringify(presence));
  });

  it('sends a member every other notice unchanged', () => {
    const notice = LIVE_MESSAGE.parse({ type: 'profile_changed', profileId: crypto.randomUUID() });
    expect(liveText('member', notice)).toBe(JSON.stringify(notice));
  });
});
