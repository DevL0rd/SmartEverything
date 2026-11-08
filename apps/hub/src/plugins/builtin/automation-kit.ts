import {
  PLUGIN_AUTOMATION,
  PLUGIN_ENTITY,
  PLUGIN_MANIFEST,
  PLUGIN_NODE,
  PLUGIN_TRIGGER,
  PLUGIN_VALUE,
  type EVENT_KINDS,
  type PluginAutomation,
  type PluginEntity,
  type PluginNode,
  type PluginTrigger,
  type PluginValue,
} from '@smarteverything/domain';
import type { z } from 'zod';
import {
  assembleContribution,
  kindStatusDetail,
  type AssembledKinds,
} from '../../automations/plugin-kinds/assemble';
import {
  driverContribution,
  pluginContribution,
  type DriverAutomationInput,
} from '../../automations/plugin-kinds/contributions';
import type { BuiltinPlugin } from './contract';
import {
  ports,
  type ActionSpec,
  type EventDecl,
  type FieldOf,
  type InputDecls,
  type NoDecls,
  type OutputDecls,
  type Pointer,
  type PortKind,
  type QuerySpec,
  type ToolArgs,
  type UntilSpec,
} from './automation-kit-types';

export * from './automation-kit-types';

function compact(entries: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

function declared<T>(schema: z.ZodType<T>, label: string, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
  throw new Error(`${label} is not a valid automation declaration: ${issues.join('; ')}`);
}

function inputRows(inputs: InputDecls): readonly Readonly<Record<string, unknown>>[] {
  return Object.entries(inputs).map(([name, decl]) =>
    compact({
      name,
      title: decl.title,
      type: decl.type,
      required: decl.required,
      default: decl.default,
      description: decl.description,
      ui: decl.ui,
    }),
  );
}

function outputRows(outputs: OutputDecls): readonly Readonly<Record<string, unknown>>[] {
  return Object.entries(outputs).map(([name, decl]) =>
    compact({
      name,
      title: decl.title,
      type: decl.type,
      optional: decl.optional,
      description: decl.description,
      from: decl.from,
    }),
  );
}

function untilRow<E extends EventDecl, In extends InputDecls, Out extends OutputDecls>(
  until: UntilSpec<E, In, Out>,
): Readonly<Record<string, unknown>> {
  return { event: until.event.kind, match: until.match, timeout: until.timeout };
}

function nodeRow<
  I extends ToolArgs,
  In extends InputDecls,
  Out extends OutputDecls,
  E extends EventDecl,
>(kind: 'action' | 'query', spec: ActionSpec<I, In, Out, E>): Readonly<Record<string, unknown>> {
  return compact({
    id: spec.id,
    version: spec.version,
    title: spec.title,
    description: spec.description,
    icon: spec.icon,
    keywords: spec.keywords,
    summary: spec.summary,
    kind,
    inputs: inputRows(spec.inputs),
    outputs: outputRows(spec.outputs ?? {}),
    run: { tool: spec.tool.name, args: spec.args },
    mode: spec.mode,
    timeout: spec.timeout,
    until: spec.until === undefined ? undefined : untilRow(spec.until),
    errors: spec.errors,
    access: spec.access,
    retry: spec.retry,
    budget: spec.budget,
    batch: spec.batch,
    waitOnly: spec.waitOnly,
  });
}

export function actionNode<
  I extends ToolArgs,
  In extends InputDecls,
  Out extends OutputDecls = NoDecls,
  E extends EventDecl = EventDecl,
>(spec: ActionSpec<I, In, Out, E>): PluginNode {
  return declared(PLUGIN_NODE, `plugin node ${spec.id}`, nodeRow('action', spec));
}

export function queryNode<
  I extends ToolArgs,
  In extends InputDecls,
  Out extends OutputDecls = NoDecls,
  E extends EventDecl = EventDecl,
>(spec: QuerySpec<I, In, Out, E>): PluginNode {
  return declared(PLUGIN_NODE, `plugin node ${spec.id}`, nodeRow('query', spec));
}

export interface DeviceEventRef {
  readonly deviceEvent: (typeof EVENT_KINDS)[number];
  readonly activity?: string;
  readonly phase?: string;
  readonly match?: Readonly<Record<string, string>>;
}

export interface TriggerFilter<Field extends string> {
  readonly kind: PortKind<unknown>;
  readonly title: string;
  readonly description: string;
  readonly match: Field;
}

export interface TriggerOutput<Field extends string> {
  readonly kind: PortKind<unknown>;
  readonly title: string;
  readonly from: Field;
}

export interface TriggerSpec<E extends EventDecl> {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly summary: string;
  readonly keywords?: readonly string[];
  readonly event: E | DeviceEventRef;
  readonly filters?: Readonly<Record<string, TriggerFilter<FieldOf<E>>>>;
  readonly outputs?: Readonly<Record<string, TriggerOutput<FieldOf<E>>>>;
  readonly timing?: PluginTrigger['timing'];
  readonly hidden?: boolean;
  readonly replacedBy?: string;
}

function eventMatch(event: DeviceEventRef): Readonly<Record<string, unknown>> | undefined {
  const match = compact({ ...event.match, activity: event.activity, phase: event.phase });
  return Object.keys(match).length === 0 ? undefined : match;
}

function triggerEvent(event: EventDecl | DeviceEventRef): unknown {
  if ('deviceEvent' in event) {
    return compact({
      deviceEvent: event.deviceEvent,
      match: eventMatch(event),
    });
  }
  return event.kind;
}

function triggerRow<E extends EventDecl>(spec: TriggerSpec<E>): Readonly<Record<string, unknown>> {
  return compact({
    id: spec.id,
    version: spec.version,
    title: spec.title,
    description: spec.description,
    icon: spec.icon,
    keywords: spec.keywords,
    summary: spec.summary,
    event: triggerEvent(spec.event),
    filters: Object.entries(spec.filters ?? {}).map(([name, filter]) => ({
      name,
      title: filter.title,
      type: filter.kind.type,
      match: filter.match,
      description: filter.description,
    })),
    outputs: Object.entries(spec.outputs ?? {}).map(([name, port]) => ({
      name,
      title: port.title,
      type: port.kind.type,
      from: port.from,
    })),
    timing: spec.timing,
    hidden: spec.hidden,
    replacedBy: spec.replacedBy,
  });
}

export function eventTrigger<E extends EventDecl = EventDecl>(spec: TriggerSpec<E>): PluginTrigger {
  return declared(PLUGIN_TRIGGER, `plugin trigger ${spec.id}`, triggerRow(spec));
}

export interface ValueOutput {
  readonly kind: PortKind<unknown>;
  readonly from: Pointer;
}

export interface ValueSpec<In extends InputDecls> {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly summary: string;
  readonly keywords?: readonly string[];
  readonly inputs?: In;
  readonly stream: string;
  readonly select?: {
    readonly list: Pointer;
    readonly key: Pointer;
    readonly port: keyof In & string;
  };
  readonly outputs: Readonly<Record<string, ValueOutput>>;
}

export function streamValue<In extends InputDecls = NoDecls>(spec: ValueSpec<In>): PluginValue {
  return declared(
    PLUGIN_VALUE,
    `plugin value ${spec.id}`,
    compact({
      id: spec.id,
      version: spec.version,
      title: spec.title,
      description: spec.description,
      icon: spec.icon,
      keywords: spec.keywords,
      summary: spec.summary,
      inputs: inputRows(spec.inputs ?? {}),
      from: compact({ stream: spec.stream, select: spec.select }),
      outputs: Object.entries(spec.outputs).map(([name, port]) => ({
        name,
        type: port.kind.type,
        from: port.from,
      })),
    }),
  );
}

export interface EntityKind {
  readonly declaration: PluginEntity;
  readonly kind: PortKind<string>;
}

export interface EntitySpec {
  readonly id: string;
  readonly title: string;
  readonly plural: string;
  readonly options: string;
}

export function entity(pluginId: string, spec: EntitySpec): EntityKind {
  return {
    declaration: declared(PLUGIN_ENTITY, `plugin entity ${spec.id}`, spec),
    kind: ports.entity(pluginId, spec.id),
  };
}

export interface AutomationSpec {
  readonly nodes?: readonly PluginNode[];
  readonly triggers?: readonly PluginTrigger[];
  readonly values?: readonly PluginValue[];
  readonly entities?: readonly EntityKind[];
  readonly autoTriggers?: boolean;
}

export function automation(spec: AutomationSpec): PluginAutomation {
  return declared(
    PLUGIN_AUTOMATION,
    'plugin automation',
    compact({
      nodes: spec.nodes,
      triggers: spec.triggers,
      values: spec.values,
      entities: spec.entities?.map((item) => item.declaration),
      autoTriggers: spec.autoTriggers,
    }),
  );
}

export type ContributionSource =
  Pick<BuiltinPlugin, 'manifest'> | { readonly driver: DriverAutomationInput };

export interface ContributionExpectation {
  readonly tools?: readonly string[];
}

function assembledOf(source: ContributionSource): AssembledKinds {
  if ('driver' in source) {
    const built = driverContribution(source.driver);
    if (!built.ok) throw new Error(`the driver contribution is invalid: ${built.problem}`);
    return assembleContribution(built.contribution);
  }
  const manifest = PLUGIN_MANIFEST.safeParse(source.manifest);
  if (!manifest.success) {
    const issues = manifest.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`);
    throw new Error(`the plugin manifest is invalid: ${issues.join('; ')}`);
  }
  return assembleContribution(pluginContribution(manifest.data));
}

function runTools(source: ContributionSource): readonly string[] {
  const automationOf =
    'driver' in source
      ? PLUGIN_AUTOMATION.parse(source.driver.automation)
      : PLUGIN_MANIFEST.parse(source.manifest).contributes.automation;
  return automationOf.nodes.map((node) => node.run.tool);
}

export function expectContributionValid(
  source: ContributionSource,
  expectation: ContributionExpectation = {},
): AssembledKinds {
  const assembled = assembledOf(source);
  const detail = kindStatusDetail(assembled.rejections);
  if (detail !== null) throw new Error(detail);
  if (expectation.tools !== undefined) {
    const known = new Set(expectation.tools);
    const missing = runTools(source).filter((tool) => !known.has(tool));
    if (missing.length > 0) {
      throw new Error(`nodes run tools the plugin does not register: ${missing.join(', ')}`);
    }
  }
  return assembled;
}
