import type {
  InputPortDecl,
  JsonValue,
  NodeRegistry,
  OptionSourceId,
  PortValue,
} from '@smarteverything/domain';
import { nodeLabel } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { walkProgram, type Program } from '@smarteverything/flow/program/walk';
import type { AutomationScope, OptionRow } from '../../../hosts/option-types';
import { portOps } from '../sections/edits';

const ON_COMPUTER = ['computer', 'target'] as const;

export const CHAIN_PARENTS: Readonly<Partial<Record<OptionSourceId, readonly string[]>>> = {
  'ir.buttons': ['remote'],
  'signal.kinds': ['source'],
  'signal.subjects': ['kind'],
  'signal.fields': ['kind'],
  'device.enum_values': ['control'],
  'computer.apps': ON_COMPUTER,
  'computer.audio_devices': ON_COMPUTER,
  'computer.audio_apps': ON_COMPUTER,
  'computer.displays': ON_COMPUTER,
  'computer.services': ON_COMPUTER,
  'computer.keyboard_layouts': ON_COMPUTER,
  'computer.startup_apps': ON_COMPUTER,
  'computer.networks': ON_COMPUTER,
  'computer.bluetooth_devices': ON_COMPUTER,
  'computer.processes': ON_COMPUTER,
  'phone.apps': ['phone', 'target'],
  'tv.inputs': ['tv'],
  'tv.apps': ['tv'],
  'tv.keys': ['tv'],
  'tv.picture_modes': ['tv'],
  'tv.sound_modes': ['tv'],
};

export function chainValuesOf(
  ports: Readonly<Record<string, PortValue>>,
): Readonly<Record<string, JsonValue>> {
  return Object.fromEntries(
    Object.entries(ports).flatMap(([name, value]) => ('lit' in value ? [[name, value.lit]] : [])),
  );
}

function directDependants(inputs: readonly InputPortDecl[], parent: string): readonly string[] {
  return inputs
    .filter((decl) => {
      const source = decl.ui?.optionsFrom;
      return source !== undefined && CHAIN_PARENTS[source]?.includes(parent) === true;
    })
    .map((decl) => decl.name);
}

export function dependantsOf(inputs: readonly InputPortDecl[], changed: string): readonly string[] {
  const found = new Set<string>();
  const queue = [changed];
  for (let parent = queue.shift(); parent !== undefined; parent = queue.shift()) {
    for (const name of directDependants(inputs, parent)) {
      if (name === changed || found.has(name)) continue;
      found.add(name);
      queue.push(name);
    }
  }
  return [...found];
}

function sameValue(a: PortValue | undefined, b: PortValue | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b);
}

export interface ChainedNode {
  readonly key: string;
  readonly inputs: readonly InputPortDecl[];
  readonly ports: Readonly<Record<string, PortValue>>;
}

export function chainedPortOps(
  node: ChainedNode,
  name: string,
  value: PortValue | null,
): readonly PatchOp[] {
  const { key, inputs, ports } = node;
  const own = portOps(key, name, value);
  if (sameValue(ports[name], value)) return own;
  const stale = dependantsOf(inputs, name).filter((port) => ports[port] !== undefined);
  if (stale.length === 0) return own;
  return [...own, { op: 'unset', key, ports: stale }];
}

function litText(value: PortValue | undefined): string {
  return value !== undefined && 'lit' in value && typeof value.lit === 'string' ? value.lit : '';
}

function namedBy(programs: readonly Program[], kind: string): readonly OptionRow[] {
  const names = new Set<string>();
  for (const program of programs) {
    for (const walked of walkProgram(program)) {
      const name = walked.node.kind === kind ? litText(walked.node.ports?.['name']) : '';
      if (name !== '') names.add(name);
    }
  }
  return [...names].map((name) => ({ id: name, label: name }));
}

function triggerRows(program: Program, registry: NodeRegistry): readonly OptionRow[] {
  if (program.kind !== 'automation') return [];
  return program.triggers.map((trigger) => {
    const kindName = registry.get(trigger.kind)?.name;
    const label = nodeLabel(trigger, (id) => registry.get(id));
    return {
      id: trigger.key,
      label,
      ...(kindName === undefined || kindName === label ? {} : { detail: kindName }),
    };
  });
}

export function automationScopeOf(
  program: Program,
  registry: NodeRegistry,
  others: readonly Program[],
): AutomationScope {
  return {
    variables: program.variables.map((variable) => ({ id: variable.name, label: variable.name })),
    triggers: triggerRows(program, registry),
    timers: namedBy([program], 'state.timer'),
    events: namedBy([program, ...others], 'signal.emit'),
  };
}
