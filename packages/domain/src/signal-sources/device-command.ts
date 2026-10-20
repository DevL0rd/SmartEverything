import type { CommandSource } from '../api/rows-home';
import type { CommandStatus } from '../commands';
import type { SignalKindSpec } from './spec';

export const COMMAND_SIGNAL_STATUSES = ['sent', 'done', 'failed', 'timed_out'] as const;

export type CommandSignalStatus = (typeof COMMAND_SIGNAL_STATUSES)[number];

export const COMMAND_SIGNAL_OF_STATUS: Readonly<Record<CommandStatus, CommandSignalStatus | null>> =
  {
    pending: 'sent',
    running: null,
    succeeded: 'done',
    failed: 'failed',
    expired: 'timed_out',
  };

export const COMMAND_FEED_STATUSES: readonly CommandSignalStatus[] = ['failed', 'timed_out'];

export const COMMAND_CAUSE_LABELS: Readonly<Record<CommandSource, string>> = {
  app: 'Someone in the app',
  assistant: 'The AI',
  automation: 'An automation',
  scene: 'A scene',
};

export const DEVICE_COMMAND_SIGNAL: SignalKindSpec = {
  kind: 'command',
  label: 'Command to a device',
  subject: 'device',
  fields: 'capabilities',
  match: [
    {
      key: 'status',
      label: 'How the command went',
      values: COMMAND_SIGNAL_STATUSES,
      valueLabels: {
        sent: 'Sent to the device',
        done: 'Done',
        failed: 'Failed',
        timed_out: 'Timed out',
      },
    },
    { key: 'capability', label: 'What it controls', values: null },
    {
      key: 'cause',
      label: 'Who or what sent it',
      values: Object.keys(COMMAND_CAUSE_LABELS),
      valueLabels: COMMAND_CAUSE_LABELS,
    },
    { key: 'error', label: 'Why it failed', values: null },
  ],
  pulse: true,
  feed: true,
  feedWhen: { key: 'status', values: COMMAND_FEED_STATUSES },
};
