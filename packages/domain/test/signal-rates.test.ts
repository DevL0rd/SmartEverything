import { describe, expect, it } from 'vitest';
import {
  HUB_SIGNALS,
  PLUGIN_SIGNAL_RATE,
  SIGNAL_SOURCES,
  kindSpecOf,
  signalRateKey,
  signalRateOf,
  signalRegistered,
  type SignalRateLine,
} from '../src';

const LINES: readonly SignalRateLine[] = [
  { source: 'camera', perMinute: 60, burst: 30, per: ['kind', 'subject'] },
  { source: 'camera', kind: 'viewed', perMinute: 6, burst: 3, per: ['subject'] },
];

describe('signal rate lines', () => {
  it('prefers the line for the kind over the line for the source', () => {
    expect(signalRateOf('camera', 'viewed', LINES)?.perMinute).toBe(6);
    expect(signalRateOf('camera', 'detected', LINES)?.perMinute).toBe(60);
  });

  it('gives every plugin source the plugin default and an unknown source nothing', () => {
    expect(signalRateOf('plugin_router', 'client_joined', LINES)).toStrictEqual({
      source: 'plugin_router',
      ...PLUGIN_SIGNAL_RATE,
    });
    expect(signalRateOf('mystery', 'x', LINES)).toBeNull();
  });

  it('keys a bucket by exactly the parts the line names', () => {
    const [source, specific] = LINES;
    if (source === undefined || specific === undefined) throw new Error('lines missing');
    const base = { source: 'camera', kind: 'viewed', subject: 'door', field: 'a' };
    expect(signalRateKey(source, base)).toBe('camera||viewed|door');
    expect(signalRateKey(source, { ...base, field: 'b' })).toBe('camera||viewed|door');
    expect(signalRateKey(specific, base)).toBe('camera|viewed|door');
    expect(signalRateKey(source, { ...base, subject: null })).toBe('camera||viewed|');
  });
});

describe('the hub storm signal', () => {
  it('is a registered, fed, urgent pulse', () => {
    const storm = kindSpecOf(SIGNAL_SOURCES, { source: 'hub', kind: 'storm' });
    expect(storm).toMatchObject({ pulse: true, feed: true, urgent: true });
    expect(HUB_SIGNALS.kinds.map((each) => each.kind)).toEqual(['started', 'storm']);
    expect(signalRegistered(SIGNAL_SOURCES, { source: 'hub', kind: 'storm', field: null })).toBe(
      true,
    );
  });
});
