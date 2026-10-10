import type { SignalSourceSpec } from './spec';

export const SCHEDULE_SIGNALS: SignalSourceSpec = {
  source: 'schedule',
  label: 'Scheduled actions',
  kinds: [
    {
      kind: 'finished',
      label: 'A scheduled action finishes',
      subject: 'schedule',
      fields: [],
      match: [
        { key: 'outcome', label: 'How it ended', values: ['done', 'failed', 'cancelled'] },
        { key: 'label', label: 'The scheduled action’s label', values: null },
      ],
      pulse: true,
    },
  ],
};
