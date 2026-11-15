import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS as E,
  AUTOMATION_V4,
  STATIC_KIND_LOOKUP,
  type AutomationV3,
  type FlowNode,
  type JsonValue,
  type PortValue,
  type TriggerNode,
} from '@smarteverything/domain';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import type { Counted, SeedContext } from './context.ts';

let counter = 0;

function keyOf(kind: string): string {
  counter += 1;
  return `${kind.split('.').at(-1) ?? kind}${String(counter)}`;
}

function literals(ports: Readonly<Record<string, JsonValue>>): Record<string, PortValue> {
  return Object.fromEntries(Object.entries(ports).map(([name, lit]) => [name, { lit }]));
}

function trigger(kind: string, ports: Readonly<Record<string, JsonValue>> = {}): TriggerNode {
  return { id: randomUUID(), key: keyOf(kind), kind, ports: literals(ports) };
}

function node(kind: string, ports: Readonly<Record<string, JsonValue>> = {}): FlowNode {
  return { id: randomUUID(), key: keyOf(kind), kind, ports: literals(ports) };
}

function program(triggers: readonly TriggerNode[], body: readonly FlowNode[]): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [...triggers],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...body] },
    policy: { mode: 'single' },
  };
}

interface Plan {
  readonly name: string;
  readonly enabled: boolean;
  readonly triggers: readonly TriggerNode[];
  readonly body: readonly FlowNode[];
}

interface Helpers {
  readonly device: (id: string) => string;
  readonly set: (id: string, control: string, to: JsonValue) => FlowNode;
  readonly log: (message: string) => FlowNode;
}

function helpersOf(device: (id: string) => string): Helpers {
  return {
    device,
    set: (id, control, to) => node('device.set', { target: { device: device(id) }, control, to }),
    log: (message) => node('debug.log', { message }),
  };
}

function timePlans({ set, log }: Helpers): readonly Plan[] {
  return [
    {
      name: 'Morning lights',
      enabled: true,
      triggers: [trigger('trigger.time', { at: '06:45', days: [1, 2, 3, 4, 5] })],
      body: [set('hw-ceiling', 'power', true), set('kt-cabinet', 'brightness', 60)],
    },
    {
      name: 'Evening scene',
      enabled: true,
      triggers: [trigger('trigger.time', { at: '19:30' })],
      body: [
        set('lr-floor', 'power', true),
        set('lr-strip', 'brightness', 35),
        log('Evening scene'),
      ],
    },
    {
      name: 'Night lights off',
      enabled: true,
      triggers: [trigger('trigger.time', { at: '23:15' })],
      body: [set('lr-ceiling', 'power', false), set('lr-floor', 'power', false)],
    },
    {
      name: 'Coffee machine routine',
      enabled: true,
      triggers: [trigger('trigger.time', { at: '07:00', days: [1, 2, 3, 4, 5] })],
      body: [
        set('kt-coffee', 'power', true),
        node('flow.wait', { duration: 900_000 }),
        set('kt-coffee', 'power', false),
      ],
    },
    {
      name: 'Humidifier at bedtime',
      enabled: true,
      triggers: [trigger('trigger.time', { at: '21:30' })],
      body: [set('bd-humidifier', 'power', true)],
    },
    {
      name: 'Hourly climate note',
      enabled: true,
      triggers: [trigger('trigger.interval', { every: 3_600_000 })],
      body: [log('Hourly check')],
    },
  ];
}

function devicePlans({ device, set, log }: Helpers): readonly Plan[] {
  return [
    {
      name: 'Hallway light on motion',
      enabled: true,
      triggers: [trigger('trigger.device', { device: device('hw-motion'), control: 'motion' })],
      body: [
        set('hw-ceiling', 'power', true),
        node('flow.wait', { duration: 300_000 }),
        set('hw-ceiling', 'power', false),
      ],
    },
    {
      name: 'Door opened log',
      enabled: true,
      triggers: [trigger('trigger.device', { device: device('hw-door'), control: 'contact' })],
      body: [log('Front door changed')],
    },
    {
      name: 'Garage door watch',
      enabled: false,
      triggers: [trigger('trigger.device', { device: device('ga-door'), control: 'contact' })],
      body: [set('ga-ceiling', 'power', true)],
    },
    {
      name: 'Kettle safety off',
      enabled: false,
      triggers: [trigger('trigger.device', { device: device('kt-kettle'), control: 'power' })],
      body: [node('flow.wait', { duration: 600_000 }), set('kt-kettle', 'power', false)],
    },
  ];
}

function otherPlans({ set }: Helpers): readonly Plan[] {
  return [
    {
      name: 'Weekend sleep in',
      enabled: false,
      triggers: [trigger('trigger.time', { at: '09:30', days: [0, 6] })],
      body: [set('bd-blind', 'cover_position', 100)],
    },
    {
      name: 'Movie mode',
      enabled: false,
      triggers: [trigger('trigger.webhook', { path: 'movie-mode' })],
      body: [set('lr-ceiling', 'brightness', 10), set('lr-tv', 'power', true)],
    },
  ];
}

function plans(device: (id: string) => string): readonly Plan[] {
  const helpers = helpersOf(device);
  return [...timePlans(helpers), ...devicePlans(helpers), ...otherPlans(helpers)];
}

export async function seedAutomations(context: SeedContext): Promise<Counted> {
  const device = (id: string): string => {
    const found = context.deviceIds.get(id);
    if (found === undefined) throw new Error(`The seeded device ${id} does not exist.`);
    return found;
  };
  let created = 0;
  let enabled = 0;
  for (const plan of plans(device)) {
    const definition = AUTOMATION_V4.parse(
      unstructure(program(plan.triggers, plan.body), STATIC_KIND_LOOKUP),
    );
    await context.api.call(E.createAutomationProgram, {
      body: { name: plan.name, enabled: plan.enabled, definition },
    });
    created += 1;
    if (plan.enabled) enabled += 1;
  }
  return { automations: created, enabled };
}
