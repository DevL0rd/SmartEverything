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
      pulse: true,
    },
  ],
};
