import { describe, expect, it } from 'vitest';
import {
  CALL_SIGNAL_SOURCES,
  LISTENING_SIGNAL_STATES,
  SIGNAL_SOURCES,
  TRANSCRIPT_PAUSE_REASONS,
  kindSpecOf,
  listeningSignalState,
  listeningSignalValue,
  sameListeningSignalState,
  signalRateOf,
  signalTriggerError,
  type ListeningSource,
} from '../src';

type Shape = Pick<ListeningSource, 'state' | 'writing'>;

const WRITING_OFF: Shape['writing'] = { state: 'off' };

describe('listening signal states', () => {
  it.each<[string, Shape, string, string | null]>([
    ['off', { state: 'off', writing: WRITING_OFF }, 'off', null],
    ['offline', { state: 'offline', writing: WRITING_OFF }, 'offline', null],
    ['privacy', { state: 'privacy', writing: WRITING_OFF }, 'paused', 'privacy'],
    ['conversation', { state: 'in_conversation', writing: WRITING_OFF }, 'paused', 'in_call'],
    ['discord', { state: 'discord_call', writing: WRITING_OFF }, 'paused', 'discord_call'],
    [
      'permission',
      { state: 'needs_permission', writing: WRITING_OFF },
      'mic_permission_lost',
      null,
    ],
    ['no host', { state: 'no_host', writing: WRITING_OFF }, 'no_host', null],
    ['listening', { state: 'listening', writing: { state: 'on' } }, 'on', null],
    ['wake only', { state: 'listening', writing: WRITING_OFF }, 'on', null],
  ])('maps %s', (_name, source, state, reason) => {
    expect(listeningSignalState(source)).toStrictEqual({ state, reason });
  });

  it('names a used-up transcript budget and a missing key while the ear still listens', () => {
    const paused = (reason: (typeof TRANSCRIPT_PAUSE_REASONS)[number]): Shape => ({
      state: 'listening',
      writing: { state: 'paused', reason },
    });
    expect(listeningSignalState(paused('cap_reached'))).toStrictEqual({
      state: 'budget_used_up',
      reason: null,
    });
    expect(listeningSignalState(paused('no_openrouter_key'))).toStrictEqual({
      state: 'paused',
      reason: 'no_openrouter_key',
    });
    expect(listeningSignalState(paused('offline'))).toStrictEqual({
      state: 'offline',
      reason: null,
    });
  });

  it('only ever produces a registered state name', () => {
    const names = TRANSCRIPT_PAUSE_REASONS.map(
      (reason) =>
        listeningSignalState({ state: 'listening', writing: { state: 'paused', reason } }).state,
    );
    names.forEach((name) => {
      expect(LISTENING_SIGNAL_STATES).toContain(name);
    });
  });

  it('puts the reason in the value so a changed reason is a new value', () => {
    const privacy = { state: 'paused', reason: 'privacy' } as const;
    const call = { state: 'paused', reason: 'in_call' } as const;
    expect(listeningSignalValue(privacy)).not.toBe(listeningSignalValue(call));
    expect(listeningSignalValue({ state: 'on', reason: null })).toBe('on');
    expect(sameListeningSignalState(privacy, { ...privacy })).toBe(true);
    expect(sameListeningSignalState(privacy, call)).toBe(false);
  });
});

describe('listening and call signal specs', () => {
  it('registers the named events with their feed and urgency decisions', () => {
    const find = (source: string, kind: string): ReturnType<typeof kindSpecOf> =>
      kindSpecOf(SIGNAL_SOURCES, { source, kind });
    expect(find('listening', 'wake_heard')).toMatchObject({ pulse: true, feed: true });
    expect(find('listening', 'state')).toMatchObject({ pulse: false, feed: true });
    expect(find('call', 'started')).toMatchObject({ pulse: true, feed: true, urgent: true });
    expect(find('call', 'ended')).toMatchObject({ pulse: true, feed: true });
    expect(find('call', 'ended')?.urgent).toBeUndefined();
    expect(find('call', 'outreach')).toMatchObject({ pulse: true, feed: true, urgent: true });
  });

  it('caps a wake at 6 a minute with a burst of 3 per source, and calls at 10 and 5', () => {
    expect(signalRateOf('listening', 'wake_heard')).toMatchObject({
      perMinute: 6,
      burst: 3,
      per: ['kind', 'subject'],
    });
    expect(signalRateOf('listening', 'state')).not.toBeNull();
    for (const kind of ['started', 'ended', 'outreach']) {
      expect(signalRateOf('call', kind)).toMatchObject({ perMinute: 10, burst: 5 });
    }
  });

  it('accepts every documented match key and refuses a transcript key', () => {
    const ok = (source: string, kind: string, match: Record<string, unknown>): boolean =>
      signalTriggerError(SIGNAL_SOURCES, { source, kind, match }) === null;
    expect(ok('listening', 'wake_heard', { source: 'camera', decidedBy: 'loudest' })).toBe(true);
    expect(ok('listening', 'state', { state: 'paused', reason: 'privacy', source: 'phone' })).toBe(
      true,
    );
    expect(ok('call', 'ended', { ending: 'hung_up', source: 'hosted' })).toBe(true);
    expect(ok('call', 'outreach', { state: 'missed', how: 'phone' })).toBe(true);
    expect(ok('call', 'started', { source: 'orb', person: 'Ana' })).toBe(true);
    expect(ok('call', 'ended', { transcript: 'hello' })).toBe(false);
    expect(ok('listening', 'wake_heard', { text: 'hey' })).toBe(false);
  });

  it('lets a call start from the hub itself as well as from the app', () => {
    expect(CALL_SIGNAL_SOURCES).toContain('hosted');
    expect(CALL_SIGNAL_SOURCES).toContain('assistant');
  });
});
