import type { Served } from './served-types';

export const SERVED_MACHINES = [
  [
    'list_machines',
    'assistant',
    'read',
    'List machines',
    'The machines your chat can run on: name, operating system, sandbox (partial when its file reads are not confined), online and which one is current (chatId from your context).',
    { part: 'list_machines' },
  ],
  [
    'switch_machine',
    'assistant',
    'control',
    'Switch machine',
    'Moves your chat to another machine by id or name from list_machines; your next tool call runs there.',
    { part: 'switch_machine' },
  ],
] as const satisfies readonly Served[];
