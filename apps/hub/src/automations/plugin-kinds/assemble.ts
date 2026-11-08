import {
  NODE_REGISTRY,
  TIMING_PORT_NAMES,
  kindProblems,
  pluginAutomationProblems,
  pluginNodeKindId,
  pluginNodeModes,
  pluginTriggerKindId,
  type InputPortDecl,
  type MatcherMapping,
  type NodeKind,
  type NodeOrigin,
  type OutputPortDecl,
  type PluginInputPort,
  type PluginKindProblems,
  type PluginNode,
  type PluginTrigger,
  type PluginValue,
  type PortUi,
} from '@smarteverything/domain';
import { valueBindingOf, type PluginValueBinding } from '../world-v3/plugin-values';
import type { AutomationContribution } from './contributions';
import type { KindVersionMap } from './versions';
import { triggerMapping, triggersOf } from './triggers';

export interface AssembledKinds {
  readonly owner: string;
  readonly kinds: readonly NodeKind[];
  readonly matchers: Readonly<Record<string, MatcherMapping>>;
  readonly values: Readonly<Record<string, PluginValueBinding>>;
  readonly maps: Readonly<Record<string, KindVersionMap>>;
  readonly rejections: readonly PluginKindProblems[];
}

type PluginPortUi = NonNullable<PluginInputPort['ui']>;

function rangeUi(ui: PluginPortUi): PortUi {
  return {
    ...(ui.min === undefined ? {} : { min: ui.min }),
    ...(ui.max === undefined ? {} : { max: ui.max }),
    ...(ui.step === undefined ? {} : { step: ui.step }),
  };
}

function pickUi(ui: PluginPortUi): PortUi {
  return {
    ...(ui.unit === undefined ? {} : { unit: ui.unit }),
    ...(ui.options === undefined ? {} : { options: ui.options }),
    ...(ui.editor === undefined ? {} : { editor: ui.editor }),
  };
}

function portUi(title: string, ui: PluginPortUi | undefined): PortUi {
  return ui === undefined ? { label: title } : { label: title, ...rangeUi(ui), ...pickUi(ui) };
}

function inputPort(port: PluginInputPort): InputPortDecl {
  return {
    name: port.name,
    type: port.type,
    required: port.required,
    ...(port.default === undefined ? {} : { default: port.default }),
    description: port.description,
    ui: portUi(port.title, port.ui),
  };
}

function nodeOutputs(node: PluginNode): OutputPortDecl[] {
  const waitOnly: readonly string[] = node.waitOnly ?? [];
  return node.outputs.map((port) => ({
    name: port.name,
    type: port.type,
    ...(port.optional === undefined ? {} : { optional: port.optional }),
    ...(waitOnly.includes(port.name) ? { waitOnly: true } : {}),
    description: port.description,
  }));
}

interface Revision {
  readonly version: number;
  readonly renamed?: Readonly<Record<string, string>> | undefined;
  readonly removedPorts?: readonly string[] | undefined;
  readonly replacedBy?: string | undefined;
}

function revisionOf(declared: Revision): Pick<NodeKind, 'version' | 'replacedBy'> {
  return {
    version: declared.version,
    ...(declared.replacedBy === undefined ? {} : { replacedBy: declared.replacedBy }),
  };
}

function mapOf(declared: Revision): KindVersionMap | undefined {
  const renamed = declared.renamed ?? {};
  const removedPorts = declared.removedPorts ?? [];
  return Object.keys(renamed).length === 0 && removedPorts.length === 0
    ? undefined
    : { renamed, removedPorts };
}

interface Owned {
  readonly contribution: AutomationContribution;
  readonly origin: NodeOrigin;
}

function nodeKind(owned: Owned, node: PluginNode): NodeKind {
  const modes = pluginNodeModes(node);
  return {
    id: pluginNodeKindId(owned.contribution.owner, node.id),
    name: node.title,
    category: 'plugins',
    icon: node.icon,
    class: 'effect',
    description: node.description,
    inputs: node.inputs.map(inputPort),
    outputs: nodeOutputs(node),
    exits: ['next'],
    effect: {
      retry: node.retry,
      budget: node.budget,
      mode: modes.default,
      ...(node.timeout === undefined ? {} : { timeout: node.timeout.default }),
    },
    summary: node.summary,
    keywords: node.keywords,
    modes,
    origin: owned.origin,
    ...revisionOf(node),
    access: node.access ?? 'owner',
    tier: 'v1',
  };
}

function valueKind(owned: Owned, value: PluginValue): NodeKind {
  return {
    id: pluginNodeKindId(owned.contribution.owner, value.id),
    name: value.title,
    category: 'plugins',
    icon: value.icon,
    class: 'read',
    description: value.description,
    inputs: value.inputs.map(inputPort),
    outputs: value.outputs.map((port) => ({
      name: port.name,
      type: port.type,
      description: `${value.title}: ${port.name}`,
    })),
    exits: [],
    summary: value.summary,
    keywords: value.keywords,
    origin: owned.origin,
    ...revisionOf(value),
    access: 'member',
    tier: 'v1',
  };
}

function timingPorts(trigger: PluginTrigger): readonly InputPortDecl[] {
  const wanted: readonly string[] = trigger.timing ?? [];
  const signal = NODE_REGISTRY.get('trigger.signal')?.inputs ?? [];
  return signal.filter((port) => TIMING_PORT_NAMES.has(port.name) && wanted.includes(port.name));
}

function triggerKind(owned: Owned, trigger: PluginTrigger): NodeKind {
  return {
    id: pluginTriggerKindId(owned.contribution.owner, trigger.id),
    name: trigger.title,
    category: 'plugins',
    icon: trigger.icon,
    class: 'trigger',
    description: trigger.description,
    inputs: [
      ...trigger.filters.map((filter) => ({
        name: filter.name,
        type: filter.type,
        required: false,
        static: true,
        description: filter.description,
        ui: { label: filter.title },
      })),
      ...timingPorts(trigger),
    ],
    outputs: trigger.outputs.map((port) => ({
      name: port.name,
      type: port.type,
      description: port.title,
    })),
    exits: [],
    summary: trigger.summary,
    keywords: trigger.keywords,
    origin: owned.origin,
    ...revisionOf(trigger),
    ...(trigger.hidden === true ? { hidden: true } : {}),
    access: 'member',
    tier: 'v1',
  };
}

interface Candidate {
  readonly declared: string;
  readonly kind: NodeKind;
  readonly matcher?: MatcherMapping;
  readonly binding?: PluginValueBinding;
  readonly map?: KindVersionMap | undefined;
  readonly problems: readonly string[];
}

function triggerCandidate(owned: Owned, trigger: PluginTrigger): Candidate {
  const mapping = triggerMapping(owned.contribution, trigger);
  const declared = pluginTriggerKindId(
    { kind: 'plugin', id: owned.contribution.owner.id },
    trigger.id,
  );
  const kind = triggerKind(owned, trigger);
  const map = mapOf(trigger);
  return mapping === null
    ? { declared, kind, map, problems: ['a driver trigger listens to a device event'] }
    : { declared, kind, map, matcher: mapping, problems: [] };
}

function candidatesOf(owned: Owned, triggers: readonly PluginTrigger[]): readonly Candidate[] {
  const { automation, owner } = owned.contribution;
  const declaredId = (local: string): string =>
    pluginNodeKindId({ kind: 'plugin', id: owner.id }, local);
  return [
    ...automation.nodes.map((node) => ({
      declared: declaredId(node.id),
      kind: nodeKind(owned, node),
      map: mapOf(node),
      problems: [],
    })),
    ...automation.values.map((value) => ({
      declared: declaredId(value.id),
      kind: valueKind(owned, value),
      binding: valueBindingOf(owner.id, value),
      map: mapOf(value),
      problems: [],
    })),
    ...triggers.map((trigger) => triggerCandidate(owned, trigger)),
  ];
}

function originOf(contribution: AutomationContribution): NodeOrigin {
  return {
    kind: contribution.owner.kind,
    id: contribution.owner.id,
    name: contribution.name,
    icon: contribution.icon,
    version: contribution.version,
  };
}

export function assembleContribution(contribution: AutomationContribution): AssembledKinds {
  const owned: Owned = { contribution, origin: originOf(contribution) };
  const declared = new Map(
    pluginAutomationProblems({
      pluginId: contribution.owner.id,
      automation: contribution.automation,
      events: contribution.events,
      data: contribution.data,
    }).map((entry) => [entry.kindId, entry.problems]),
  );
  const kinds: NodeKind[] = [];
  const matchers: Record<string, MatcherMapping> = {};
  const values: Record<string, PluginValueBinding> = {};
  const maps: Record<string, KindVersionMap> = {};
  const generated = triggersOf(contribution);
  const rejections: PluginKindProblems[] = [...generated.rejections];
  for (const candidate of candidatesOf(owned, generated.triggers)) {
    const problems = [
      ...(declared.get(candidate.declared) ?? []),
      ...candidate.problems,
      ...kindProblems(candidate.kind),
    ];
    if (problems.length > 0) {
      rejections.push({ kindId: candidate.kind.id, problems });
      continue;
    }
    kinds.push(candidate.kind);
    if (candidate.matcher !== undefined) matchers[candidate.kind.id] = candidate.matcher;
    if (candidate.binding !== undefined) values[candidate.kind.id] = candidate.binding;
    if (candidate.map !== undefined) maps[candidate.kind.id] = candidate.map;
  }
  return { owner: ownerKeyOf(contribution), kinds, matchers, values, maps, rejections };
}

function ownerKeyOf(contribution: AutomationContribution): string {
  return `${contribution.owner.kind}:${contribution.owner.id}`;
}

export function kindStatusDetail(rejections: readonly PluginKindProblems[]): string | null {
  if (rejections.length === 0) return null;
  const lines = rejections.map((item) => `${item.kindId} (${item.problems.join(', ')})`);
  return `Automation kinds rejected: ${lines.join('; ')}`;
}
