import { NODE_REGISTRY } from '../../src/automation-nodes';
import type { DescribeContext } from '../../src/automation-v3/describe-context';
import type { FlowNode, TriggerNode } from '../../src/automation-v3/node';
import type { AutomationV3, FunctionV3 } from '../../src/automation-v3/program';

export const ids = {
  trigger: '00000000-0000-4000-8000-000000000001',
  cycle: '00000000-0000-4000-8000-000000000002',
  setLights: '00000000-0000-4000-8000-000000000003',
  switchDevice: '00000000-0000-4000-8000-000000000010',
  lamp: '00000000-0000-4000-8000-000000000011',
  kitchen: '00000000-0000-4000-8000-000000000012',
  secret: '00000000-0000-4000-8000-000000000013',
  fn: '00000000-0000-4000-8000-000000000014',
  other: '00000000-0000-4000-8000-000000000015',
  group: '00000000-0000-4000-8000-000000000016',
  node: '00000000-0000-4000-8000-0000000000a0',
} as const;

const NAMES: Readonly<Record<string, string>> = {
  [`device:${ids.switchDevice}`]: 'Kitchen switch',
  [`device:${ids.lamp}`]: 'Desk lamp',
  [`room:${ids.kitchen}`]: 'Kitchen',
  [`secret:${ids.secret}`]: 'Weather key',
  [`group:${ids.group}`]: 'Downstairs',
};

export const CTX: DescribeContext = {
  kinds: NODE_REGISTRY.get,
  names: (kind, id) => NAMES[`${kind}:${id}`],
};

function nodeId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`;
}

export function node(
  index: number,
  key: string,
  kind: string,
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { id: nodeId(index), key, kind, ...extra };
}

export const pressTrigger: TriggerNode = {
  id: ids.trigger,
  key: 'press',
  kind: 'trigger.button',
  ports: { device: { lit: ids.switchDevice }, press: { lit: 'single_press' } },
};

export const program: AutomationV3 = {
  version: 3,
  kind: 'automation',
  triggers: [pressTrigger],
  inputs: [],
  outputs: [],
  variables: [{ name: 'level', type: { t: 'number' }, initial: { lit: 0 }, persist: true }],
  body: {
    nodes: [
      {
        id: ids.cycle,
        key: 'cycle',
        kind: 'var.change',
        label: 'Cycle level',
        ports: {
          source: { lit: 'automation' },
          name: { lit: 'level' },
          op: { lit: 'next' },
          steps: { lit: [1, 25, 50, 75, 100] },
          edge: { lit: 'wrap' },
        },
      },
      {
        id: ids.setLights,
        key: 'setLights',
        kind: 'device.set',
        ports: {
          target: { lit: { room: ids.kitchen, families: ['light'] } },
          control: { lit: 'brightness' },
          to: { wire: { from: 'cycle', port: 'value' } },
        },
      },
    ],
  },
  policy: { mode: 'queue', max: 10 },
};

export const functionProgram: FunctionV3 = {
  version: 3,
  kind: 'function',
  flavour: 'action',
  inputs: [],
  outputs: [],
  exits: ['done'],
  variables: [],
  body: {
    nodes: [
      node(1, 'send', 'device.set', {
        ports: { target: { lit: { device: ids.lamp } }, control: { lit: 'power' } },
      }),
    ],
  },
};
