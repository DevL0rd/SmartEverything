import type { SignalSourceSpec } from './spec';

export const STORM_REASONS = ['cap', 'global'] as const;

export type StormReason = (typeof STORM_REASONS)[number];

export const HUB_SIGNALS: SignalSourceSpec = {
  source: 'hub',
  label: 'Home hub',
  kinds: [
    {
      kind: 'started',
      label: 'The hub started',
      subject: 'none',
      fields: [],
      match: [],
      pulse: true,
    },
    {
      kind: 'storm',
      label: 'Signals dropped in a flood',
      subject: 'none',
      fields: [],
      match: [
        { key: 'source', label: 'Source that flooded', values: null },
        { key: 'kind', label: 'Kind that flooded', values: null },
        {
          key: 'reason',
          label: 'Why signals were dropped',
          values: STORM_REASONS,
          valueLabels: {
            cap: 'One signal repeated too fast',
            global: 'Too many signals at once',
          },
        },
      ],
      pulse: true,
      feed: true,
      urgent: true,
    },
  ],
};
