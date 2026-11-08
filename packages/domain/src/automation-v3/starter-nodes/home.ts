import { STARTER_NODE_IDS, type StarterNode } from './ids';

export const SWITCH_DEVICES: StarterNode = {
  id: STARTER_NODE_IDS.switchDevices,
  name: 'Switch devices',
  program: {
    version: 4,
    kind: 'function',
    flavour: 'action',
    description:
      'Switches a set of devices on or off and reports which ones were reached and which were skipped.',
    category: 'devices',
    icon: 'power',
    inputs: [
      {
        name: 'devices',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'The devices to switch.',
      },
      { name: 'on', type: { t: 'boolean' }, required: true, description: 'On or off.' },
    ],
    outputs: [
      {
        name: 'sent',
        type: { t: 'list', of: { t: 'ref', of: 'device' } },
        description: 'The devices that were switched.',
      },
      {
        name: 'skipped',
        type: {
          t: 'list',
          of: {
            t: 'record',
            fields: { device: { t: 'ref', of: 'device' }, reason: { t: 'text' } },
          },
        },
        description: 'The devices that were left alone, with the reason.',
      },
    ],
    exits: ['done'],
    variables: [],
    nodes: [
      {
        id: 'c803c589-f3c7-8e02-aee0-b79bf27e014d',
        key: 'start',
        kind: 'flow.start',
        to: { next: 'switch' },
      },
      {
        id: 'b0000000-0006-4000-8000-000000000001',
        key: 'switch',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'devices' } },
          control: { lit: 'power' },
          to: { wire: { from: 'inputs', port: 'on' } },
        },
        to: { next: 'result' },
      },
      {
        id: 'b0000000-0006-4000-8000-000000000002',
        key: 'result',
        kind: 'flow.return',
        ports: {
          sent: { wire: { from: 'switch', port: 'sent' } },
          skipped: { wire: { from: 'switch', port: 'skipped' } },
        },
      },
    ],
  },
};

export const LEAVE_HOME_CHECK: StarterNode = {
  id: STARTER_NODE_IDS.leaveHomeCheck,
  name: 'Leave home check',
  program: {
    version: 4,
    kind: 'function',
    flavour: 'action',
    description:
      'Switches the lights off, finds the windows and doors still open, and tells the people what was left open.',
    category: 'presence',
    icon: 'door-open',
    inputs: [
      {
        name: 'people',
        type: { t: 'list', of: { t: 'ref', of: 'person' } },
        required: true,
        description: 'The people to tell.',
      },
      {
        name: 'lights',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'The lights to switch off.',
      },
      {
        name: 'openings',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'The window and door sensors to check.',
      },
    ],
    outputs: [
      {
        name: 'openItems',
        type: { t: 'list', of: { t: 'text' } },
        description: 'The openings that were still open.',
      },
    ],
    exits: ['done'],
    variables: [
      { name: 'openItems', type: { t: 'list', of: { t: 'text' } }, initial: { lit: [] } },
    ],
    nodes: [
      {
        id: '86e8cbb2-991c-8501-bb8f-51bb1b793727',
        key: 'start',
        kind: 'flow.start',
        to: { next: 'off' },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000001',
        key: 'open',
        kind: 'device.aggregate',
        ports: {
          target: { wire: { from: 'inputs', port: 'openings' } },
          control: { lit: 'contact' },
          fn: { lit: 'any' },
          matches: { lit: true },
        },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000002',
        key: 'off',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'power' },
          to: { lit: false },
        },
        to: { next: 'each' },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000005',
        key: 'each',
        kind: 'flow.for_each',
        ports: { items: { wire: { from: 'open', port: 'matching' } } },
        to: { next: 'left', body: 'note' },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000003',
        key: 'label',
        kind: 'text.format',
        ports: { template: { lit: '{a}' }, a: { wire: { from: 'each', port: 'item' } } },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000004',
        key: 'note',
        kind: 'var.change',
        ports: {
          name: { lit: 'openItems' },
          op: { lit: 'append' },
          amount: { wire: { from: 'label', port: 'text' } },
        },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000006',
        key: 'names',
        kind: 'text.join',
        ports: {
          items: { wire: { from: 'vars', port: 'openItems' } },
          lastSeparator: { lit: ' and ' },
        },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000007',
        key: 'anyOpen',
        kind: 'logic.compare',
        ports: { a: { wire: { from: 'open', port: 'count' } }, op: { lit: 'gt' }, b: { lit: 0 } },
      },
      {
        id: 'b0000000-000c-4000-8000-00000000000b',
        key: 'left',
        kind: 'flow.if',
        branches: [
          {
            id: 'b0000000-000c-4000-8000-00000000000a',
            when: { wire: { from: 'anyOpen', port: 'result' } },
            to: 'tell',
          },
        ],
        to: { else: 'result' },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000008',
        key: 'message',
        kind: 'text.format',
        ports: {
          template: { lit: 'Still open: {a}. The lights are off.' },
          a: { wire: { from: 'names', port: 'text' } },
        },
      },
      {
        id: 'b0000000-000c-4000-8000-000000000009',
        key: 'tell',
        kind: 'notify.person',
        ports: {
          people: { wire: { from: 'inputs', port: 'people' } },
          title: { lit: 'Before you go' },
          body: { wire: { from: 'message', port: 'text' } },
        },
        to: { next: 'result' },
      },
      {
        id: 'b0000000-000c-4000-8000-00000000000c',
        key: 'result',
        kind: 'flow.return',
        ports: { openItems: { wire: { from: 'vars', port: 'openItems' } } },
      },
    ],
  },
};
