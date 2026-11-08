import { describe, expect, it } from 'vitest';
import { deliveryAnnouncement, deliveryNoteOf, deliveryOf, sentByVoice } from './delivery';

const sent = { state: 'queued', reason_code: null } as const;

describe('deliveryOf', () => {
  it('shows a message sent while the AI works as queued, then delivered', () => {
    expect(deliveryOf(sent, true)).toBe('queued');
    expect(deliveryOf({ state: 'delivered', reason_code: null }, true)).toBe('delivered');
  });

  it('then seen once the AI answers it', () => {
    expect(deliveryOf({ state: 'working', reason_code: null }, true)).toBe('seen');
    expect(deliveryOf({ state: 'answered', reason_code: null }, false)).toBe('seen');
  });

  it('never calls an idle-time message queued', () => {
    expect(deliveryOf(sent, false)).toBe('sent');
    expect(deliveryOf({ state: 'delivered', reason_code: null }, false)).toBe('sent');
  });

  it('keeps failure first', () => {
    expect(deliveryOf({ state: 'failed', reason_code: 'offline' }, true)).toBe('failed');
  });

  it('tells a stopped or interrupted message apart from a failed one', () => {
    expect(deliveryOf({ state: 'failed', reason_code: 'stopped' }, false)).toBe('interrupted');
    expect(deliveryOf({ state: 'failed', reason_code: 'interrupted' }, false)).toBe('interrupted');
  });
});

describe('the words in the own meta line', () => {
  it('say only that a failed message was not sent', () => {
    expect(deliveryNoteOf({ reason_code: 'offline' }, 'failed')).toBe('Not sent');
  });

  it('say an interruption but never repeat Stopped', () => {
    expect(deliveryNoteOf({ reason_code: 'interrupted' }, 'interrupted')).toBe('Interrupted');
    expect(deliveryNoteOf({ reason_code: 'stopped' }, 'interrupted')).toBeNull();
  });

  it('are absent for every delivery glyph', () => {
    for (const mark of ['sending', 'queued', 'sent', 'delivered', 'seen'] as const)
      expect(deliveryNoteOf({ reason_code: null }, mark)).toBeNull();
  });
});

describe('a message sent by voice', () => {
  const voice = {
    origin: { source: 'voice', plugin_id: null, device_id: null, name: null },
    reason_code: null,
  } as const;

  it('is recognised from its origin', () => {
    expect(sentByVoice(voice)).toBe(true);
    expect(sentByVoice({ origin: null })).toBe(false);
  });

  it('is announced with its time and delivery', () => {
    expect(deliveryAnnouncement(voice, 'seen', '13:46')).toBe(
      'By voice · 13:46 · Seen by the assistant',
    );
  });
});
