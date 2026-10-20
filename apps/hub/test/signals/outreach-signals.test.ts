import type { AiOutreachRow, RowChange, SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignalBus } from '../../src/signals/bus';
import { feedSignals } from '../../src/signals/sources/feed';
import { feedContextOf } from '../../src/signals/sources/feed-context';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const REASON = 'Your mother asked me to tell you something private';

let opened: TestStore;
let heard: SignalInput[];

beforeEach(async () => {
  opened = await testStore();
  heard = [];
  const bus = new SignalBus({ log: testLogger('signals') });
  bus.subscribe((signal) => {
    if (signal.source === 'call') heard.push(signal);
  });
  opened.store.feed.subscribe((change: RowChange) => {
    const context = feedContextOf(
      new Date('2026-10-18T10:00:00.000Z'),
      () => 'UTC',
      () => null,
    );
    feedSignals(change, context).forEach(bus.emit);
  });
});

afterEach(async () => {
  await opened.close();
});

function outreach(
  state: AiOutreachRow['state'],
  how: AiOutreachRow['how'] = 'phone',
): AiOutreachRow {
  return opened.store.aiOutreach.add({
    profile_id: opened.store.profiles.first().id,
    chat_id: null,
    from_chat_id: null,
    how,
    target: 'target-id',
    target_label: 'Ana’s phone',
    reason: REASON,
    urgent: true,
    state,
    detail: null,
    expires_at: null,
    origin: null,
  });
}

function states(): unknown[] {
  return heard.map((signal) => signal.value);
}

describe('outreach signals', () => {
  it('report a ring that is answered and say nothing more when it ends', () => {
    const row = outreach('ringing');
    opened.store.aiOutreach.step(row.id, { state: 'live', callId: crypto.randomUUID() });
    opened.store.aiOutreach.step(row.id, { state: 'ended' });
    expect(states()).toStrictEqual(['ringing', 'answered']);
    expect(heard[0]).toMatchObject({
      kind: 'outreach',
      subject: row.profile_id,
      profileId: row.profile_id,
      data: { state: 'ringing', how: 'phone', target: 'Ana’s phone', urgent: true },
    });
  });

  it('report a declined, a missed and a failed ring', () => {
    const declined = outreach('ringing');
    opened.store.aiOutreach.step(declined.id, { state: 'declined' });
    const missed = outreach('ringing');
    opened.store.aiOutreach.step(missed.id, { state: 'missed' });
    expect(states()).toStrictEqual(['ringing', 'declined', 'ringing', 'missed']);
    const failed = outreach('ringing');
    opened.store.aiOutreach.step(failed.id, { state: 'failed', detail: 'no answer path' });
    expect(states().slice(-1)).toStrictEqual(['ringing']);
  });

  it('keep one person within a burst of 5 outreach signals', () => {
    for (let index = 0; index < 4; index += 1) {
      const row = outreach('ringing');
      opened.store.aiOutreach.step(row.id, { state: 'missed' });
    }
    expect(heard).toHaveLength(5);
  });

  it('report a failed ring', () => {
    const failed = outreach('ringing');
    opened.store.aiOutreach.step(failed.id, { state: 'failed', detail: 'no answer path' });
    expect(states()).toStrictEqual(['ringing', 'failed']);
  });

  it('report a message that was sent without ringing', () => {
    outreach('sent', 'message');
    expect(states()).toStrictEqual(['sent']);
    expect(heard[0]?.data['how']).toBe('message');
  });

  it('do not repeat a state that did not change and never carry the reason', () => {
    const row = outreach('ringing');
    opened.store.aiOutreach.step(row.id, { state: 'ringing', detail: 'still ringing' });
    expect(states()).toStrictEqual(['ringing']);
    expect(JSON.stringify(heard)).not.toContain(REASON);
  });
});
