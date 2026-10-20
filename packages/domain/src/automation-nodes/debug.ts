import { defineNodeKind, type NodeKind } from './define';

export const DEBUG_LOG = defineNodeKind({
  id: 'debug.log',
  name: 'Log',
  category: 'debug',
  icon: 'notebook-pen',
  class: 'effect',
  description: 'Writes a line to the run history and the hub log.',
  inputs: [
    {
      name: 'message',
      type: { t: 'text' },
      required: true,
      live: true,
      description: 'The line to write.',
      summary: true,
    },
    {
      name: 'data',
      type: { t: 'optional', of: { t: 'any' } },
      required: false,
      description: 'A value to record with the line.',
    },
    {
      name: 'level',
      type: {
        t: 'choice',
        options: [
          { id: 'info', label: 'Info' },
          { id: 'warn', label: 'Warning' },
          { id: 'error', label: 'Error' },
        ],
      },
      required: false,
      default: 'info',
      static: true,
      description: 'How serious the line is.',
    },
  ],
  outputs: [],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Log {message}',
  keywords: ['print', 'trace', 'debug', 'console'],
  access: 'member',
  tier: 'v1',
});

export const DEBUG_NOTE = defineNodeKind({
  id: 'debug.note',
  name: 'Note',
  category: 'debug',
  icon: 'sticky-note',
  class: 'pure',
  description: 'A note on the canvas. It is only for the editor and never runs.',
  inputs: [
    {
      name: 'text',
      type: { t: 'text' },
      required: false,
      default: '',
      static: true,
      description: 'The note, with a small set of formatting.',
      summary: true,
    },
    {
      name: 'color',
      type: { t: 'optional', of: { t: 'color' } },
      required: false,
      static: true,
      description: 'The colour of the note.',
    },
  ],
  outputs: [],
  exits: [],
  summary: '{text}',
  keywords: ['comment', 'sticky', 'remark'],
  access: 'member',
  tier: 'v1',
});

export const DEBUG_BREAKPOINT = defineNodeKind({
  id: 'debug.breakpoint',
  name: 'Pause here',
  category: 'debug',
  icon: 'circle-pause',
  class: 'control',
  description:
    'Pauses a test run at this point until the person continues it, so the values so far can be looked at.',
  inputs: [],
  outputs: [],
  exits: ['next'],
  summary: 'Pause here',
  keywords: ['breakpoint', 'pause', 'step'],
  access: 'member',
  tier: 'v1.1',
});

export const DEBUG_KINDS: readonly NodeKind[] = [DEBUG_LOG, DEBUG_NOTE, DEBUG_BREAKPOINT];
