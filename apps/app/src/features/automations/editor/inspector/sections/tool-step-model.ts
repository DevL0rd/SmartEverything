import type { JsonValue, PortValue } from '@smarteverything/domain';
import { MCP_TOOLS, NODE_REGISTRY, outputLabel } from '@smarteverything/domain';

type JsonObject = Readonly<Record<string, JsonValue>>;

export interface ToolSwap {
  readonly kind: string;
  readonly name: string;
  readonly ports: Readonly<Record<string, PortValue>>;
}

export interface ToolValue {
  readonly name: string;
  readonly text: string;
}

export type DeviceName = (id: string) => string | undefined;

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

const TARGET_IDS: Readonly<Record<string, readonly [string, string]>> = {
  device: ['deviceId', 'device'],
  room: ['roomId', 'room'],
  group: ['groupId', 'group'],
};

function targetOf(value: JsonValue | undefined): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const kind = text(value['kind']);
  const shape = kind === undefined ? undefined : TARGET_IDS[kind];
  if (shape === undefined) return undefined;
  const id = text(value[shape[0]]);
  return id === undefined ? undefined : { [shape[1]]: id };
}

function lits(
  entries: readonly (readonly [string, JsonValue | undefined])[],
): Record<string, PortValue> {
  return Object.fromEntries(
    entries.flatMap(([name, value]) => (value === undefined ? [] : [[name, { lit: value }]])),
  );
}

type PortsOf = (args: JsonObject) => Record<string, PortValue>;

const TOOL_STEPS: Readonly<Record<string, { readonly kind: string; readonly ports: PortsOf }>> = {
  voice_speak: {
    kind: 'notify.speak',
    ports: (args) =>
      lits([
        ['target', targetOf(args['target'])],
        ['text', text(args['text'])],
      ]),
  },
  person_notify: {
    kind: 'notify.person',
    ports: (args) => {
      const person = text(args['personId']);
      return lits([
        ['people', person === undefined ? undefined : [person]],
        ['body', text(args['text']) ?? text(args['message'])],
      ]);
    },
  },
};

export function toolTitle(tool: string): string | undefined {
  return MCP_TOOLS.find((entry) => entry.name === tool)?.title;
}

export function toolSwapOf(tool: string, args: JsonValue | undefined): ToolSwap | undefined {
  const step = TOOL_STEPS[tool];
  const kind = step === undefined ? undefined : NODE_REGISTRY.get(step.kind);
  if (step === undefined || kind === undefined) return undefined;
  return { kind: kind.id, name: kind.name, ports: step.ports(isObject(args) ? args : {}) };
}

function valueText(value: JsonValue, device: DeviceName): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const target = targetOf(value);
  const id = target === undefined ? undefined : text(target['device']);
  if (id !== undefined) return device(id) ?? 'A device';
  if (Array.isArray(value)) return `${String(value.length)} items`;
  if (value === null) return 'Nothing';
  return `${String(Object.keys(value).length)} values`;
}

export function toolValues(args: JsonValue | undefined, device: DeviceName): readonly ToolValue[] {
  if (!isObject(args)) return [];
  return Object.entries(args).map(([name, value]) => ({
    name: outputLabel(name),
    text: valueText(value, device),
  }));
}
