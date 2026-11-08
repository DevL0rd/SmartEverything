import { z } from 'zod';
import {
  EFFECT_BUDGET_CLASSES,
  EFFECT_RETRY_CLASSES,
  NODE_ACCESS,
} from './automation-nodes/define';
import { PORT_EDITORS } from './automation-nodes/option-sources';
import { summaryProblems } from './automation-nodes/summary-template';
import { IDENT } from './automation-v3/ident';
import { ACTION_MODE, CATCHABLE_ERROR_CLASS, DURATION_MS } from './automation-v3/policy';
import type { FlowType } from './automation-v3/types';
import { EVENT_KINDS } from './events';
import { PLUGIN_INPUT_TYPE, PLUGIN_PORT_TYPE, leavesOf } from './plugin-port-types';
import { VERSION_MAP, versionMapProblems } from './plugin-version-map';
import { PLUGIN_KEY as KEY, PLUGIN_TITLE as TITLE, PLUGIN_TOOL as TOOL } from './plugin-parts';
import { JSON_VALUE, type JsonValue } from './values';

export const PLUGIN_KIND_LOCAL_ID = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'a local kind id is lowercase letters, digits and underscores');

const TEXT = z.string().trim().min(1);
const ICON = z.string().min(1).max(40);
const VERSION = z.int().min(1);
const KEYWORDS = z.array(TEXT).default([]);

export const JSON_POINTER = z
  .string()
  .regex(/^(\/([^~/]|~[01])*)*$/, 'a JSON pointer such as /items/0/name');

const CHOICE_OPTION = z.strictObject({ id: TEXT, label: TEXT });

export const PLUGIN_PORT_UI = z.strictObject({
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  unit: TEXT.optional(),
  options: z.array(CHOICE_OPTION).min(1).optional(),
  editor: z.enum(PORT_EDITORS).optional(),
});

export const PLUGIN_INPUT_PORT = z.strictObject({
  name: IDENT,
  title: TITLE,
  type: PLUGIN_INPUT_TYPE,
  required: z.boolean(),
  default: JSON_VALUE.optional(),
  description: TEXT,
  ui: PLUGIN_PORT_UI.optional(),
});

export type PluginInputPort = z.output<typeof PLUGIN_INPUT_PORT>;

export const PLUGIN_NODE_OUTPUT = z.strictObject({
  name: IDENT,
  title: TITLE,
  type: PLUGIN_PORT_TYPE,
  optional: z.boolean().optional(),
  description: TEXT,
  from: JSON_POINTER,
});

export type ArgSource =
  | { readonly port: string }
  | { readonly lit: JsonValue }
  | { readonly record: Readonly<Record<string, ArgSource>> };

export const ARG_SOURCE: z.ZodType<ArgSource> = z.lazy(() =>
  z.union([
    z.strictObject({ port: IDENT }),
    z.strictObject({ lit: JSON_VALUE }),
    z.strictObject({ record: z.record(TEXT, ARG_SOURCE) }),
  ]),
);

export const PLUGIN_NODE_KINDS = ['action', 'query'] as const;

const MODES = z.strictObject({ default: ACTION_MODE, allowed: z.array(ACTION_MODE).min(1) });

const TIMEOUT = z.strictObject({ default: DURATION_MS, max: DURATION_MS });

const UNTIL_MATCH = z.union([z.strictObject({ output: IDENT }), z.strictObject({ port: IDENT })]);

const UNTIL = z.strictObject({
  event: KEY,
  match: z.record(KEY, UNTIL_MATCH),
  timeout: z.union([DURATION_MS, z.strictObject({ port: IDENT })]),
});

const NODE_FIELDS = z.strictObject({
  id: PLUGIN_KIND_LOCAL_ID,
  version: VERSION,
  title: TITLE,
  description: TEXT,
  icon: ICON,
  keywords: KEYWORDS,
  summary: TEXT,
  kind: z.enum(PLUGIN_NODE_KINDS),
  inputs: z.array(PLUGIN_INPUT_PORT).default([]),
  outputs: z.array(PLUGIN_NODE_OUTPUT).default([]),
  run: z.strictObject({ tool: TOOL, args: z.record(TEXT, ARG_SOURCE).default({}) }),
  mode: MODES.optional(),
  timeout: TIMEOUT.optional(),
  until: UNTIL.optional(),
  errors: z.record(KEY, CATCHABLE_ERROR_CLASS).optional(),
  access: z.enum(NODE_ACCESS).optional(),
  retry: z.enum(EFFECT_RETRY_CLASSES).default('external'),
  budget: z.enum(EFFECT_BUDGET_CLASSES).default('effects'),
  batch: z.strictObject({ arg: TEXT }).optional(),
  waitOnly: z.array(IDENT).optional(),
  ...VERSION_MAP,
});

type NodeFields = z.output<typeof NODE_FIELDS>;

export type PluginNodeModes = z.output<typeof MODES>;

export function pluginNodeModes(node: Pick<NodeFields, 'kind' | 'mode'>): PluginNodeModes {
  if (node.mode !== undefined) return node.mode;
  return node.kind === 'query'
    ? { default: 'wait_for_result', allowed: ['wait_for_result'] }
    : { default: 'fire_and_forget', allowed: ['fire_and_forget', 'wait_for_result'] };
}

function duplicates(names: readonly string[]): readonly string[] {
  return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
}

function argPorts(source: ArgSource): readonly string[] {
  if ('port' in source) return [source.port];
  if ('lit' in source) return [];
  return Object.values(source.record).flatMap(argPorts);
}

function untilTimeoutProblems(
  until: NodeFields['until'],
  inputs: readonly string[],
): readonly string[] {
  if (until === undefined || typeof until.timeout === 'number') return [];
  return inputs.includes(until.timeout.port)
    ? []
    : [`until times out on the unknown port ${until.timeout.port}`];
}

function bindingProblems(node: NodeFields, inputs: readonly string[]): readonly string[] {
  const outputs = node.outputs.map((port) => port.name);
  const bound = Object.values(node.run.args).flatMap(argPorts);
  const matched = Object.values(node.until?.match ?? {});
  return [
    ...bound
      .filter((port) => !inputs.includes(port))
      .map((port) => `run binds the unknown port ${port}`),
    ...matched.flatMap((match) =>
      'port' in match
        ? inputs.includes(match.port)
          ? []
          : [`until matches the unknown port ${match.port}`]
        : outputs.includes(match.output)
          ? []
          : [`until matches the unknown output ${match.output}`],
    ),
    ...untilTimeoutProblems(node.until, inputs),
    ...(node.waitOnly ?? [])
      .filter((name) => !outputs.includes(name))
      .map((name) => `waitOnly names the unknown output ${name}`),
    ...(node.batch === undefined || node.batch.arg in node.run.args
      ? []
      : [`batch names the unknown argument ${node.batch.arg}`]),
  ];
}

function timeoutProblems(node: NodeFields, waits: boolean): readonly string[] {
  if (node.timeout === undefined) return waits ? ['a node that can wait needs a timeout'] : [];
  return node.timeout.default > node.timeout.max
    ? ['the default timeout is longer than the longest']
    : [];
}

function modeProblems(node: NodeFields): readonly string[] {
  const modes = pluginNodeModes(node);
  const waits = modes.allowed.includes('wait_for_result');
  return [
    ...(modes.allowed.includes(modes.default) ? [] : ['the default mode is not an allowed mode']),
    ...(node.kind === 'query' && modes.allowed.includes('fire_and_forget')
      ? ['a query only runs in wait mode']
      : []),
    ...timeoutProblems(node, waits),
    ...(!waits && (node.waitOnly ?? []).length > 0 ? ['waitOnly outputs need wait mode'] : []),
  ];
}

export function pluginNodeProblems(node: NodeFields): readonly string[] {
  const inputs = node.inputs.map((port) => port.name);
  return [
    ...summaryProblems(node.summary, inputs),
    ...duplicates(inputs).map((name) => `the input ${name} is declared twice`),
    ...duplicates(node.outputs.map((port) => port.name)).map(
      (name) => `the output ${name} is declared twice`,
    ),
    ...bindingProblems(node, inputs),
    ...modeProblems(node),
    ...versionMapProblems(node, [...inputs, ...node.outputs.map((port) => port.name)]),
  ];
}

function withProblems<T>(problemsOf: (value: T) => readonly string[]) {
  return (value: T, ctx: z.RefinementCtx): void => {
    for (const message of problemsOf(value)) ctx.addIssue({ code: 'custom', message });
  };
}

export const PLUGIN_NODE = NODE_FIELDS.superRefine(withProblems(pluginNodeProblems));

export type PluginNode = z.output<typeof PLUGIN_NODE>;

export const PLUGIN_TRIGGER_TIMINGS = ['hold', 'debounce', 'cooldown'] as const;

const EVENT_FIELD = z
  .string()
  .regex(/^[a-z][A-Za-z0-9_.-]{0,79}$/, 'an event field name starting with a lower-case letter');

const DEVICE_EVENT = z.strictObject({
  deviceEvent: z.enum(EVENT_KINDS),
  match: z.record(EVENT_FIELD, TEXT).optional(),
});

const TRIGGER_FIELDS = z.strictObject({
  id: PLUGIN_KIND_LOCAL_ID,
  version: VERSION,
  title: TITLE,
  description: TEXT,
  icon: ICON,
  keywords: KEYWORDS,
  summary: TEXT,
  event: z.union([KEY, DEVICE_EVENT]),
  filters: z
    .array(
      z.strictObject({
        name: IDENT,
        title: TITLE,
        type: PLUGIN_INPUT_TYPE,
        match: EVENT_FIELD,
        description: TEXT,
      }),
    )
    .default([]),
  outputs: z
    .array(z.strictObject({ name: IDENT, title: TITLE, type: PLUGIN_PORT_TYPE, from: EVENT_FIELD }))
    .default([]),
  timing: z.array(z.enum(PLUGIN_TRIGGER_TIMINGS)).optional(),
  hidden: z.boolean().optional(),
  ...VERSION_MAP,
});

type TriggerFields = z.output<typeof TRIGGER_FIELDS>;

export function pluginTriggerProblems(trigger: TriggerFields): readonly string[] {
  const filters = trigger.filters.map((filter) => filter.name);
  return [
    ...(trigger.hidden === true && trigger.replacedBy === undefined
      ? ['a hidden trigger names the kind that replaces it in replacedBy']
      : []),
    ...summaryProblems(trigger.summary, filters),
    ...duplicates(filters).map((name) => `the filter ${name} is declared twice`),
    ...duplicates(trigger.outputs.map((port) => port.name)).map(
      (name) => `the output ${name} is declared twice`,
    ),
    ...versionMapProblems(trigger, [...filters, ...trigger.outputs.map((port) => port.name)]),
  ];
}

export const PLUGIN_TRIGGER = TRIGGER_FIELDS.superRefine(withProblems(pluginTriggerProblems));

export type PluginTrigger = z.output<typeof PLUGIN_TRIGGER>;

const VALUE_FIELDS = z.strictObject({
  id: PLUGIN_KIND_LOCAL_ID,
  version: VERSION,
  title: TITLE,
  description: TEXT,
  icon: ICON,
  keywords: KEYWORDS,
  summary: TEXT,
  inputs: z.array(PLUGIN_INPUT_PORT).default([]),
  from: z.strictObject({
    stream: KEY,
    select: z.strictObject({ list: JSON_POINTER, key: JSON_POINTER, port: IDENT }).optional(),
  }),
  outputs: z.array(z.strictObject({ name: IDENT, type: PLUGIN_PORT_TYPE, from: JSON_POINTER })),
  ...VERSION_MAP,
});

type ValueFields = z.output<typeof VALUE_FIELDS>;

function selectorType(type: FlowType): boolean {
  if (type.t === 'optional') return selectorType(type.of);
  return type.t === 'entity' || type.t === 'choice';
}

export function pluginValueProblems(value: ValueFields): readonly string[] {
  const inputs = value.inputs.map((port) => port.name);
  const select = value.from.select;
  return [
    ...summaryProblems(value.summary, inputs),
    ...duplicates(inputs).map((name) => `the input ${name} is declared twice`),
    ...duplicates(value.outputs.map((port) => port.name)).map(
      (name) => `the output ${name} is declared twice`,
    ),
    ...value.inputs
      .filter((port) => !selectorType(port.type))
      .map((port) => `the value input ${port.name} must be an entity or a choice`),
    ...(select === undefined || inputs.includes(select.port)
      ? []
      : [`the selector names the unknown port ${select.port}`]),
    ...versionMapProblems(value, [...inputs, ...value.outputs.map((port) => port.name)]),
  ];
}

export const PLUGIN_VALUE = VALUE_FIELDS.superRefine(withProblems(pluginValueProblems));

export type PluginValue = z.output<typeof PLUGIN_VALUE>;

export const PLUGIN_ENTITY = z.strictObject({ id: KEY, title: TITLE, plural: TITLE, options: KEY });

export type PluginEntity = z.output<typeof PLUGIN_ENTITY>;

const AUTOMATION_FIELDS = z.strictObject({
  nodes: z.array(PLUGIN_NODE).default([]),
  triggers: z.array(PLUGIN_TRIGGER).default([]),
  values: z.array(PLUGIN_VALUE).default([]),
  entities: z.array(PLUGIN_ENTITY).default([]),
  autoTriggers: z.boolean().default(true),
});

type AutomationFields = z.output<typeof AUTOMATION_FIELDS>;

function automationIdProblems(automation: AutomationFields): readonly string[] {
  const kinds = [...automation.nodes, ...automation.values].map((entry) => entry.id);
  return [
    ...duplicates(kinds).map((id) => `the node or value ${id} is declared twice`),
    ...duplicates(automation.triggers.map((entry) => entry.id)).map(
      (id) => `the trigger ${id} is declared twice`,
    ),
    ...duplicates(automation.entities.map((entry) => entry.id)).map(
      (id) => `the entity ${id} is declared twice`,
    ),
  ];
}

export const PLUGIN_AUTOMATION = AUTOMATION_FIELDS.superRefine(withProblems(automationIdProblems));

export type PluginAutomation = z.output<typeof PLUGIN_AUTOMATION>;

export type AutomationOwner =
  | { readonly kind: 'plugin'; readonly id: string }
  | { readonly kind: 'driver'; readonly id: string };

export function automationOwnerKey(owner: AutomationOwner): string {
  const local = owner.id.replaceAll('-', '_');
  return owner.kind === 'plugin' ? local : `driver_${local}`;
}

export function pluginNodeKindId(owner: AutomationOwner, localId: string): string {
  return `plugin.${automationOwnerKey(owner)}.${localId}`;
}

export function pluginTriggerKindId(owner: AutomationOwner, localId: string): string {
  return `trigger.plugin.${automationOwnerKey(owner)}.${localId}`;
}

export function pluginEntityType(pluginId: string, entityId: string): FlowType {
  return { t: 'entity', of: `${pluginId}.${entityId}` };
}

export interface PluginAutomationContext {
  readonly pluginId: string;
  readonly automation: PluginAutomation;
  readonly events: readonly { readonly kind: string }[];
  readonly data: readonly { readonly stream: string }[];
}

export interface PluginKindProblems {
  readonly kindId: string;
  readonly problems: readonly string[];
}

function entityRefs(ports: readonly { readonly type: FlowType }[]): readonly string[] {
  return ports.flatMap((port) =>
    leavesOf(port.type).flatMap((leaf) => (leaf.t === 'entity' ? [leaf.of] : [])),
  );
}

function entityProblems(
  context: PluginAutomationContext,
  ports: readonly { readonly type: FlowType }[],
): readonly string[] {
  const known = new Set(
    context.automation.entities.map((entity) => `${context.pluginId}.${entity.id}`),
  );
  return entityRefs(ports)
    .filter((of) => !known.has(of))
    .map((of) => `the entity type ${of} is not declared by this plugin`);
}

function eventProblem(context: PluginAutomationContext, event: string): readonly string[] {
  return context.events.some((declared) => declared.kind === event)
    ? []
    : [`the event ${event} is not declared in contributes.events`];
}

function nodeEntry(context: PluginAutomationContext, node: PluginNode): PluginKindProblems {
  return {
    kindId: pluginNodeKindId({ kind: 'plugin', id: context.pluginId }, node.id),
    problems: [
      ...entityProblems(context, [...node.inputs, ...node.outputs]),
      ...(node.until === undefined ? [] : eventProblem(context, node.until.event)),
    ],
  };
}

function triggerEntry(
  context: PluginAutomationContext,
  trigger: PluginTrigger,
): PluginKindProblems {
  return {
    kindId: pluginTriggerKindId({ kind: 'plugin', id: context.pluginId }, trigger.id),
    problems: [
      ...entityProblems(context, [...trigger.filters, ...trigger.outputs]),
      ...(typeof trigger.event === 'string' ? eventProblem(context, trigger.event) : []),
    ],
  };
}

function valueEntry(context: PluginAutomationContext, value: PluginValue): PluginKindProblems {
  const streamKnown = context.data.some((stream) => stream.stream === value.from.stream);
  return {
    kindId: pluginNodeKindId({ kind: 'plugin', id: context.pluginId }, value.id),
    problems: [
      ...entityProblems(context, [...value.inputs, ...value.outputs]),
      ...(streamKnown
        ? []
        : [`the stream ${value.from.stream} is not declared in contributes.data`]),
    ],
  };
}

export function pluginAutomationProblems(
  context: PluginAutomationContext,
): readonly PluginKindProblems[] {
  const { nodes, triggers, values } = context.automation;
  return [
    ...nodes.map((node) => nodeEntry(context, node)),
    ...triggers.map((trigger) => triggerEntry(context, trigger)),
    ...values.map((value) => valueEntry(context, value)),
  ].filter((entry) => entry.problems.length > 0);
}
