import { describe, expect, it } from 'vitest';
import { SIGNAL_SOURCES, signalRateOf } from '../src';

describe('signal rate caps', () => {
  it('give every kind of every registered source a cap, because the bus drops a signal without one', () => {
    const uncapped = SIGNAL_SOURCES.flatMap((spec) =>
      spec.kinds
        .filter((kind) => signalRateOf(spec.source, kind.kind) === null)
        .map((kind) => `${spec.source}/${kind.kind}`),
    );
    expect(uncapped).toEqual([]);
  });

  it('caps the signals automations send themselves per name', () => {
    expect(signalRateOf('automation_event', 'sent')).toMatchObject({
      perMinute: 60,
      per: ['kind', 'field'],
    });
    expect(signalRateOf('automation_timer', 'finished')).toMatchObject({ per: ['kind', 'field'] });
    expect(signalRateOf('webhook', 'received')).toMatchObject({ per: ['kind', 'field'] });
  });
});
