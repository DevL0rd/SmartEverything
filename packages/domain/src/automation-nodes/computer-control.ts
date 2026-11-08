import { PROCESS_PRIORITIES, PROCESS_SIGNALS } from '../node/computer-processes';
import { COMPUTER, SEND_EFFECT, SENT, TEXT, WAIT_EFFECT, choice, text } from './computer-port-kit';
import { defineNodeKind, type InputPortDecl, type NodeKind } from './define';
import { ERROR_OUT } from './error-port';

export const PROCESS_ACTION_CHOICES = [
  { id: 'end', label: 'End' },
  { id: 'force', label: 'Force end' },
  { id: 'stop', label: 'Pause' },
  { id: 'continue', label: 'Resume' },
  { id: 'priority', label: 'Change priority' },
] as const;

export const PROCESS_PRIORITY_CHOICES = PROCESS_PRIORITIES.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

export const PROCESS_ACTION_IDS = [...PROCESS_SIGNALS, 'priority'] as const;

const KEYS: InputPortDecl = {
  ...text(
    'keys',
    'Key combination',
    'One key or a combination such as Return, ctrl+l, alt+Left or F5. Give keys or text, not both.',
  ),
  summary: true,
  ui: { label: 'Key combination', editor: 'key-combo' },
};

const TYPED: InputPortDecl = {
  ...text(
    'text',
    'Text',
    'Text to type into the app in front. Give keys or text, not both. Pointer clicks stay with the AI.',
  ),
  summary: true,
};

const PROCESSES: InputPortDecl = {
  name: 'process',
  type: { t: 'list', of: TEXT },
  required: true,
  live: true,
  description: 'The programs to act on, picked from what is running on the computer.',
  summary: true,
  ui: { label: 'Programs', optionsFrom: 'computer.processes', multiple: true },
};

const computerKeys = defineNodeKind({
  id: 'computer.keys',
  name: 'Computer keys',
  category: 'computers',
  icon: 'keyboard',
  class: 'effect',
  description:
    'Presses a key or a key combination, or types a text, on a computer, in the app that is in front. It needs keyboard control to be turned on in the permissions of that computer. Clicking at a point on the screen is left to the AI.',
  inputs: [COMPUTER, KEYS, TYPED],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Press {keys} or type {text} on {computer}',
  keywords: ['keyboard', 'press', 'type', 'shortcut', 'hotkey', 'key', 'text', 'computer'],
  access: 'member',
  tier: 'v1.1',
});

const computerProcess = defineNodeKind({
  id: 'computer.process',
  name: 'Computer programs',
  category: 'computers',
  icon: 'activity',
  class: 'effect',
  description:
    'Ends, force ends, pauses, resumes or changes the priority of running programs on a computer. Ending asks a program to quit; force ending quits it at once and unsaved work can be lost. Priority is set to normal, low or lowest. It reports how many programs it reached. A program is picked by its process number, which a computer gives out again after a restart, so pick it when the program is running.',
  inputs: [
    COMPUTER,
    { ...choice('action', PROCESS_ACTION_CHOICES, 'Action', 'What to do.'), required: true },
    PROCESSES,
    choice(
      'priority',
      PROCESS_PRIORITY_CHOICES,
      'Priority',
      'How much processor the programs get. Used by Change priority.',
    ),
  ],
  outputs: [
    {
      name: 'ended',
      type: { t: 'number', integer: true, min: 0 },
      description: 'How many programs the action reached.',
    },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: WAIT_EFFECT,
  summary: '{action} {process} on {computer}',
  keywords: ['process', 'program', 'kill', 'end', 'quit', 'pause', 'resume', 'priority', 'nice'],
  access: 'member',
  tier: 'v1.1',
});

const computerWindows = defineNodeKind({
  id: 'computer.windows',
  name: 'Computer windows',
  category: 'computers',
  icon: 'layers',
  class: 'effect',
  description:
    'Reads which apps have a window open on a computer and which app is in front. An app with several windows is listed once.',
  inputs: [COMPUTER],
  outputs: [
    {
      name: 'apps',
      type: { t: 'list', of: TEXT },
      description: 'The names of the apps with a window open.',
    },
    {
      name: 'focused',
      type: TEXT,
      optional: true,
      description: 'The name of the app in front. Left out when no app window is in front.',
    },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Windows of {computer}',
  keywords: ['window', 'app', 'open', 'focused', 'front', 'running', 'computer'],
  access: 'member',
  tier: 'v1.1',
});

export const COMPUTER_CONTROL_KINDS: readonly NodeKind[] = [
  computerKeys,
  computerProcess,
  computerWindows,
];
