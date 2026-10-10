import type { SignalSourceSpec } from './spec';

export const ASSISTANT_SIGNALS: SignalSourceSpec = {
  source: 'assistant',
  label: 'AI',
  kinds: [
    {
      kind: 'reply_finished',
      label: 'The AI finishes a reply',
      subject: 'chat',
      fields: [],
      pulse: true,
    },
  ],
};
