import { describe, expect, it } from 'vitest';
import { PRESENCE_SIGNALS, SIGNAL_SOURCES, kindSpecOf, signalRateOf } from '../src';

describe('presence signals', () => {
  it('registers the presence source with a person match on both kinds', () => {
    expect(SIGNAL_SOURCES).toContain(PRESENCE_SIGNALS);
    for (const kind of ['person_arrived', 'person_left']) {
      expect(
        kindSpecOf(SIGNAL_SOURCES, { source: 'presence', kind })?.match.map((entry) => entry.key),
      ).toEqual(['person_id']);
    }
  });

  it('keeps the flip rate the router events had', () => {
    for (const kind of ['person_arrived', 'person_left']) {
      expect(signalRateOf('presence', kind)).toMatchObject({ perMinute: 6, burst: 3 });
    }
  });

  it('no longer exports router event names from the domain', async () => {
    const domain = await import('../src');
    expect(Object.keys(domain)).not.toContain('PERSON_ARRIVED_EVENT');
    expect(Object.keys(domain)).not.toContain('PERSON_LEFT_EVENT');
  });
});
