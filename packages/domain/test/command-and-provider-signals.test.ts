import { describe, expect, it } from 'vitest';
import {
  COMMAND_FEED_STATUSES,
  COMMAND_SIGNAL_OF_STATUS,
  COMMAND_SIGNAL_STATUSES,
  DEVICE_COMMAND_SIGNAL,
  PROVIDER_STATES,
  SIGNAL_SOURCES,
  kindSpecOf,
  providerInOutage,
  providerStateOf,
  signalFeeds,
  signalRateOf,
  signalRegistered,
} from '../src';

describe('providerStateOf', () => {
  it('reads a linked service as linked', () => {
    expect(providerStateOf({ status: 'linked', problem: null })).toBe('linked');
  });

  it('reads a service that cannot be reached as down and one that needs a person as attention', () => {
    expect(providerStateOf({ status: 'needs_attention', problem: 'network' })).toBe('down');
    expect(providerStateOf({ status: 'needs_attention', problem: 'session_expired' })).toBe(
      'attention',
    );
    expect(providerStateOf({ status: 'needs_attention', problem: null })).toBe('attention');
  });

  it('has no state while linking or after unlinking', () => {
    expect(providerStateOf({ status: 'linking', problem: null })).toBeNull();
    expect(providerStateOf({ status: 'unlinked', problem: null })).toBeNull();
  });

  it('calls only attention and down an outage', () => {
    expect(PROVIDER_STATES.filter((state) => providerInOutage(state))).toStrictEqual([
      'attention',
      'down',
    ]);
    expect(providerInOutage(null)).toBe(false);
  });
});

describe('device command signal', () => {
  it('gives every command status but running a signal status', () => {
    expect(
      Object.values(COMMAND_SIGNAL_OF_STATUS).filter((status) => status !== null),
    ).toStrictEqual(COMMAND_SIGNAL_STATUSES);
    expect(COMMAND_SIGNAL_OF_STATUS.running).toBeNull();
  });

  it('is registered for a device control and rate limited per device', () => {
    expect(kindSpecOf(SIGNAL_SOURCES, { source: 'device', kind: 'command' })).toBe(
      DEVICE_COMMAND_SIGNAL,
    );
    expect(
      signalRegistered(SIGNAL_SOURCES, { source: 'device', kind: 'command', field: 'brightness' }),
    ).toBe(true);
    expect(signalRateOf('device', 'command')).toMatchObject({
      perMinute: 60,
      burst: 20,
      per: ['kind', 'subject'],
    });
  });

  it('labels every status it can report', () => {
    const status = DEVICE_COMMAND_SIGNAL.match.find((entry) => entry.key === 'status');
    expect(status?.values).toStrictEqual(COMMAND_SIGNAL_STATUSES);
    expect(Object.keys(status?.valueLabels ?? {})).toStrictEqual([...COMMAND_SIGNAL_STATUSES]);
  });
});

describe('signalFeeds', () => {
  const feedsFailures = {
    feed: true,
    feedWhen: { key: 'status', values: COMMAND_FEED_STATUSES },
  } as const;

  it('feeds only the commands that failed or timed out', () => {
    const feeds = (status: string): boolean => signalFeeds(feedsFailures, { data: { status } });
    expect(COMMAND_SIGNAL_STATUSES.filter(feeds)).toStrictEqual(['failed', 'timed_out']);
  });

  it('does not feed a signal whose condition key is missing or not text', () => {
    expect(signalFeeds(feedsFailures, { data: {} })).toBe(false);
    expect(signalFeeds(feedsFailures, { data: { status: 3 } })).toBe(false);
  });

  it('feeds every signal of a feed kind with no condition and none of a kind without one', () => {
    expect(signalFeeds({ feed: true }, { data: {} })).toBe(true);
    expect(signalFeeds({ feed: false }, { data: {} })).toBe(false);
    expect(signalFeeds({}, { data: {} })).toBe(false);
  });

  it('feeds a command spec through the same rule', () => {
    expect(signalFeeds(DEVICE_COMMAND_SIGNAL, { data: { status: 'sent' } })).toBe(false);
    expect(signalFeeds(DEVICE_COMMAND_SIGNAL, { data: { status: 'failed' } })).toBe(true);
  });
});

describe('provider signal', () => {
  it('is a connection state that reaches the feed, capped per service', () => {
    const spec = kindSpecOf(SIGNAL_SOURCES, { source: 'provider', kind: 'status' });
    expect(spec).toMatchObject({ pulse: false, feed: true });
    expect(signalRateOf('provider', 'status')).toMatchObject({ perMinute: 6, burst: 3 });
  });
});
