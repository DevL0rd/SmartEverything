import type { McpToolName } from '@smarteverything/domain';

const LAMP = '6d000000-0000-4000-8000-000000000003';
const PERSON = '6d000000-0000-4000-8000-000000000005';

const NIGHT_LIGHT_PROGRAM = {
  version: 4,
  kind: 'automation',
  description: 'Lamp on at 22:00.',
  triggers: [
    {
      id: '6d000000-0000-4000-8000-000000000011',
      key: 'night',
      kind: 'trigger.time',
      ports: { at: { lit: '22:00' } },
    },
  ],
  inputs: [],
  outputs: [],
  variables: [],
  nodes: [
    {
      id: '6d000000-0000-4000-8000-000000000021',
      key: 'start',
      kind: 'flow.start',
      to: { next: 'lampOn' },
    },
    {
      id: '6d000000-0000-4000-8000-000000000022',
      key: 'lampOn',
      kind: 'device.set',
      ports: {
        target: { lit: { devices: [LAMP] } },
        control: { lit: 'power' },
        to: { lit: true },
      },
    },
  ],
  policy: { mode: 'single' },
};

const NIGHT_LIGHT_ID = '6d000000-0000-4000-8000-000000000001';

export const TOOL_EXAMPLES: Readonly<Partial<Record<McpToolName, readonly object[]>>> = {
  automation_edit: [
    { action: 'check', definition: NIGHT_LIGHT_PROGRAM },
    {
      action: 'patch',
      automationId: NIGHT_LIGHT_ID,
      ops: [
        {
          op: 'add',
          node: {
            key: 'dim',
            kind: 'device.set',
            ports: {
              target: { lit: { devices: [LAMP] } },
              control: { lit: 'brightness' },
              to: { lit: 40 },
            },
          },
          after: { key: 'lampOn', port: 'next' },
        },
        { op: 'set', key: 'lampOn', label: 'Lamp on at night' },
      ],
    },
  ],
  schedule_edit: [
    {
      action: 'create',
      label: 'Lamp off',
      timing: { kind: 'in', seconds: 1200 },
      steps: [
        {
          kind: 'tool',
          tool: 'device_control',
          args: { deviceIds: [LAMP], capability: 'power', value: false },
        },
      ],
    },
  ],
  widget_show: [{ widgets: [{ kind: 'device', id: LAMP }, { kind: 'weather' }] }],
  food_log: [{ action: 'water', personId: PERSON, millilitres: 250 }],
  image_gen: [
    {
      action: 'generate',
      prompt: 'A watercolour of a lighthouse at dawn, soft light, wide shot',
    },
  ],
};

export function toolExamples(name: string): readonly object[] | undefined {
  return Object.entries(TOOL_EXAMPLES).find(([tool]) => tool === name)?.[1];
}
