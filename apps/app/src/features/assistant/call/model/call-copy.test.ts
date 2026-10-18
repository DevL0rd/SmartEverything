import { describe, expect, it } from 'vitest';
import { IDLE_CALL, type CallMissed, type CallSightRequest, type CallView } from '../call-state';
import { consentTitle, sublineOf, statusOf } from './call-copy';
import { MISSED_KEPT_MS, missedActionOf, missedLeftMs, missedOf, missedTitle } from './call-missed';

const NAME = 'Coordinator';

function call(change: Partial<CallView>): CallView {
  return { ...IDLE_CALL, ...change };
}

describe('live status', () => {
  it('uses the warm working copy while thinking', () => {
    expect(statusOf(call({ phase: 'thinking' }), NAME)).toBe('Working on it…');
  });

  it('names the assistant while speaking and says Muted when muted', () => {
    expect(statusOf(call({ phase: 'speaking' }), NAME)).toBe(NAME);
    expect(statusOf(call({ phase: 'listening', muted: true }), NAME)).toBe('Muted');
    expect(statusOf(call({ phase: 'listening' }), NAME)).toBe('Listening');
  });

  it('explains a dropped connection', () => {
    expect(statusOf(call({ phase: 'reconnecting' }), NAME)).toBe('Reconnecting…');
    expect(sublineOf(call({ phase: 'reconnecting' }), NAME, '02:14')).toBe(
      'Your home connection dropped. Hold on.',
    );
  });

  it('shows the name and elapsed time while live', () => {
    expect(sublineOf(call({ phase: 'speaking' }), NAME, '02:14')).toBe('Coordinator · 02:14');
  });

  it('uses the end state title and footnote once the call is over', () => {
    const over = call({ phase: 'ended', ending: 'failed', problem: 'The line dropped' });
    expect(statusOf(over, NAME)).toBe('Call didn’t work');
    expect(sublineOf(over, NAME, '02:14')).toBe('The line dropped');
  });
});

describe('camera request copy', () => {
  it('asks in the assistant’s name for each kind of source', () => {
    expect(consentTitle(NAME, 'phone_camera', null)).toBe('Coordinator wants to see your camera');
    expect(consentTitle(NAME, 'phone_screen', null)).toBe('Coordinator wants to see your screen');
    expect(consentTitle(NAME, 'home_camera', 'Porch')).toBe('Coordinator wants to look at Porch');
    expect(consentTitle(NAME, 'desktop_window', null)).toBe('Coordinator wants to see a window');
  });
});

describe('missed request', () => {
  const request: CallSightRequest = {
    requestId: '00000000-0000-4000-8000-000000000009',
    what: 'phone_camera',
    why: 'To see the plant you mentioned',
    target: null,
  };

  it('remembers what was asked and when it was declined', () => {
    expect(missedOf(request, 5000)).toEqual({
      requestId: request.requestId,
      what: 'phone_camera',
      target: null,
      at: 5000,
    });
  });

  it('reads as a past request with the same wording as the live one', () => {
    expect(missedTitle(NAME, missedOf(request, 0))).toBe(
      'Missed: Coordinator wanted to see your camera',
    );
  });

  it('stays for two minutes and then runs out', () => {
    const missed: CallMissed = missedOf(request, 10_000);
    expect(missedLeftMs(missed, 10_000)).toBe(MISSED_KEPT_MS);
    expect(missedLeftMs(missed, 10_000 + 60_000)).toBe(60_000);
    expect(missedLeftMs(missed, 10_000 + MISSED_KEPT_MS + 1)).toBe(0);
    expect(MISSED_KEPT_MS).toBe(120_000);
  });

  it('shows the same thing again through the matching control', () => {
    expect(missedActionOf('phone_camera')).toBe('camera');
    expect(missedActionOf('phone_screen')).toBe('share');
    expect(missedActionOf('desktop_screen')).toBe('share');
    expect(missedActionOf('desktop_window')).toBe('window');
    expect(missedActionOf('home_camera')).toBe('home');
  });
});
