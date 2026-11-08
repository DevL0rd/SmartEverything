import type { SignalSourceSpec } from './spec';

export const PRESENCE_SIGNAL_SOURCE = 'presence';

export const PRESENCE_ARRIVED_KIND = 'person_arrived';

export const PRESENCE_LEFT_KIND = 'person_left';

const PERSON_MATCH = [{ key: 'person_id', label: 'The person', values: null }] as const;

export const PRESENCE_SIGNALS: SignalSourceSpec = {
  source: PRESENCE_SIGNAL_SOURCE,
  label: 'People at home',
  kinds: [
    {
      kind: PRESENCE_ARRIVED_KIND,
      label: 'A person arrives home',
      subject: 'none',
      fields: [],
      match: PERSON_MATCH,
      pulse: true,
      feed: true,
    },
    {
      kind: PRESENCE_LEFT_KIND,
      label: 'A person leaves home',
      subject: 'none',
      fields: [],
      match: PERSON_MATCH,
      pulse: true,
      feed: true,
    },
  ],
};
