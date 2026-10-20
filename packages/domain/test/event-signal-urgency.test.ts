import { describe, expect, it } from 'vitest';
import { EVENT_KINDS, isUrgent } from '../src/events';
import { EVENT_SIGNALS } from '../src/signal-sources/event';

describe('event signals', () => {
  it('mark exactly the urgent event kinds as urgent, so a storm never drops them', () => {
    const urgent = EVENT_SIGNALS.kinds
      .filter((kind) => kind.urgent === true)
      .map((kind) => kind.kind);
    expect(urgent.sort()).toStrictEqual(['alarm', 'call', 'doorbell', 'leak', 'smoke']);
  });

  it('agree with isUrgent for every event kind', () => {
    for (const kind of EVENT_KINDS.filter((candidate) => candidate !== 'signal')) {
      const spec = EVENT_SIGNALS.kinds.find((entry) => entry.kind === kind);
      expect(spec?.urgent === true, kind).toBe(isUrgent(kind));
    }
  });
});
