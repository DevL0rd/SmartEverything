import { APP_MATCH } from './event-match';
import type { SignalSourceSpec } from './spec';

export const COMPUTER_SIGNALS: SignalSourceSpec = {
  source: 'computer',
  label: 'Computers',
  kinds: [
    {
      kind: 'app_open',
      label: 'App on a computer',
      subject: 'device',
      fields: 'free',
      match: APP_MATCH,
      pulse: false,
      states: { on: 'open', off: 'closed' },
    },
    {
      kind: 'app_focus',
      label: 'App in front on a computer',
      subject: 'device',
      fields: 'free',
      match: APP_MATCH,
      pulse: false,
      states: { on: 'in front', off: 'not in front' },
    },
  ],
};
