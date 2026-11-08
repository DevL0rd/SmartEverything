import { STARTER_NODE_IDS, type StarterNode } from './ids';

export const LIGHTS_OFF_AFTER: StarterNode = {
  id: STARTER_NODE_IDS.lightsOffAfter,
  name: 'Lights off after no motion',
  program: {
    version: 4,
    kind: 'function',
    flavour: 'action',
    description:
      'Waits until a motion sensor is quiet, waits the given time, and turns the lights off if it is still quiet.',
    category: 'lights',
    icon: 'timer',
    inputs: [
      {
        name: 'lights',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'The lights to turn off.',
      },
      {
        name: 'sensor',
        type: { t: 'ref', of: 'device' },
        required: true,
        description: 'The motion sensor to watch.',
      },
      {
        name: 'after',
        type: { t: 'duration' },
        required: true,
        description: 'How long the room must stay quiet.',
      },
    ],
    outputs: [
      {
        name: 'turnedOff',
        type: { t: 'boolean' },
        description: 'Whether the lights were turned off.',
      },
    ],
    exits: ['done'],
    variables: [{ name: 'turnedOff', type: { t: 'boolean' }, initial: { lit: false } }],
    nodes: [
      {
        id: 'c5c49b29-a22b-89cf-b55d-043bd3f12a8c',
        key: 'start',
        kind: 'flow.start',
        to: { next: 'quiet' },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000001',
        key: 'first',
        kind: 'device.get',
        ports: { device: { wire: { from: 'inputs', port: 'sensor' } }, control: { lit: 'motion' } },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000002',
        key: 'moving',
        kind: 'logic.compare',
        ports: {
          a: { wire: { from: 'first', port: 'value' } },
          op: { lit: 'eq' },
          b: { lit: true },
        },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000003',
        key: 'still',
        kind: 'logic.not',
        ports: { flag: { wire: { from: 'moving', port: 'result' } } },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000004',
        key: 'quiet',
        kind: 'flow.wait_condition',
        ports: { condition: { wire: { from: 'still', port: 'result' } } },
        to: { next: 'pause' },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000005',
        key: 'pause',
        kind: 'flow.wait',
        ports: { duration: { wire: { from: 'inputs', port: 'after' } } },
        to: { next: 'stillQuiet' },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000006',
        key: 'second',
        kind: 'device.get',
        ports: { device: { wire: { from: 'inputs', port: 'sensor' } }, control: { lit: 'motion' } },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000007',
        key: 'movingAgain',
        kind: 'logic.compare',
        ports: {
          a: { wire: { from: 'second', port: 'value' } },
          op: { lit: 'eq' },
          b: { lit: true },
        },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000008',
        key: 'stillAgain',
        kind: 'logic.not',
        ports: { flag: { wire: { from: 'movingAgain', port: 'result' } } },
      },
      {
        id: 'b0000000-0009-4000-8000-00000000000c',
        key: 'stillQuiet',
        kind: 'flow.if',
        branches: [
          {
            id: 'b0000000-0009-4000-8000-00000000000b',
            when: { wire: { from: 'stillAgain', port: 'result' } },
            to: 'off',
          },
        ],
        to: { else: 'result' },
      },
      {
        id: 'b0000000-0009-4000-8000-000000000009',
        key: 'off',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'power' },
          to: { lit: false },
        },
        to: { next: 'done' },
      },
      {
        id: 'b0000000-0009-4000-8000-00000000000a',
        key: 'done',
        kind: 'var.set',
        ports: { name: { lit: 'turnedOff' }, to: { lit: true } },
        to: { next: 'result' },
      },
      {
        id: 'b0000000-0009-4000-8000-00000000000d',
        key: 'result',
        kind: 'flow.return',
        ports: { turnedOff: { wire: { from: 'vars', port: 'turnedOff' } } },
      },
    ],
  },
};

export const FLASH_THE_LIGHTS: StarterNode = {
  id: STARTER_NODE_IDS.flashTheLights,
  name: 'Flash the lights',
  program: {
    version: 4,
    kind: 'function',
    flavour: 'action',
    description:
      'Remembers the lights, flashes them in a colour a few times, and puts them back as they were.',
    category: 'lights',
    icon: 'bell-ring',
    inputs: [
      {
        name: 'lights',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'The lights to flash.',
      },
      { name: 'color', type: { t: 'color' }, required: true, description: 'The colour to flash.' },
      {
        name: 'times',
        type: { t: 'number', integer: true, min: 1 },
        required: false,
        description: 'How many flashes.',
        default: 3,
      },
    ],
    outputs: [],
    exits: ['done'],
    variables: [],
    nodes: [
      {
        id: '0a707371-e7ff-8d22-af4c-f5fe4b4d03e6',
        key: 'start',
        kind: 'flow.start',
        to: { next: 'saved' },
      },
      {
        id: 'b0000000-000a-4000-8000-000000000001',
        key: 'saved',
        kind: 'device.snapshot',
        ports: { target: { wire: { from: 'inputs', port: 'lights' } } },
        to: { next: 'flashes' },
      },
      {
        id: 'b0000000-000a-4000-8000-000000000006',
        key: 'flashes',
        kind: 'flow.repeat',
        ports: { times: { wire: { from: 'inputs', port: 'times' } } },
        to: { next: 'back', body: 'colour' },
      },
      {
        id: 'b0000000-000a-4000-8000-000000000002',
        key: 'colour',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'color' },
          to: { wire: { from: 'inputs', port: 'color' } },
        },
        to: { next: 'lit' },
      },
      {
        id: 'b0000000-000a-4000-8000-000000000003',
        key: 'lit',
        kind: 'flow.wait',
        ports: { duration: { lit: 500 } },
        to: { next: 'dark' },
      },
      {
        id: 'b0000000-000a-4000-8000-000000000004',
        key: 'dark',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'power' },
          to: { lit: false },
        },
        to: { next: 'rest' },
      },
      {
        id: 'b0000000-000a-4000-8000-000000000005',
        key: 'rest',
        kind: 'flow.wait',
        ports: { duration: { lit: 500 } },
      },
      {
        id: 'b0000000-000a-4000-8000-000000000007',
        key: 'back',
        kind: 'device.restore',
        ports: { snapshot: { wire: { from: 'saved', port: 'snapshot' } } },
      },
    ],
  },
};

export const WAKE_UP_LIGHT: StarterNode = {
  id: STARTER_NODE_IDS.wakeUpLight,
  name: 'Wake-up light',
  program: {
    version: 4,
    kind: 'function',
    flavour: 'action',
    description: 'Starts the lights at one percent in warm white and brightens them to full.',
    category: 'lights',
    icon: 'sunrise',
    inputs: [
      {
        name: 'lights',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'The lights to wake you with.',
      },
      {
        name: 'over',
        type: { t: 'duration' },
        required: true,
        description: 'How long the sunrise takes.',
      },
      {
        name: 'kelvin',
        type: { t: 'number' },
        required: false,
        description: 'The warm white to start from.',
        default: 2700,
      },
    ],
    outputs: [],
    exits: ['done'],
    variables: [],
    nodes: [
      {
        id: '111002b7-0a0d-8df7-965d-6d2f722d7777',
        key: 'start',
        kind: 'flow.start',
        to: { next: 'on' },
      },
      {
        id: 'b0000000-000b-4000-8000-000000000001',
        key: 'on',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'power' },
          to: { lit: true },
        },
        to: { next: 'warm' },
      },
      {
        id: 'b0000000-000b-4000-8000-000000000002',
        key: 'warm',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'color_temperature' },
          to: { wire: { from: 'inputs', port: 'kelvin' } },
        },
        to: { next: 'dim' },
      },
      {
        id: 'b0000000-000b-4000-8000-000000000003',
        key: 'dim',
        kind: 'device.set',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'brightness' },
          to: { lit: 1 },
        },
        to: { next: 'rise' },
      },
      {
        id: 'b0000000-000b-4000-8000-000000000004',
        key: 'rise',
        kind: 'device.fade',
        ports: {
          target: { wire: { from: 'inputs', port: 'lights' } },
          control: { lit: 'brightness' },
          from: { lit: 1 },
          to: { lit: 100 },
          over: { wire: { from: 'inputs', port: 'over' } },
        },
      },
    ],
  },
};
