import {
  API_ENDPOINTS as E,
  JSON_VALUE,
  SHIPPED_TIERS,
  fallibleOf,
  modesOf,
  type AutomationCatalogReply,
  type AutomationFunctionSummary,
  type DescribeContext,
  type FlowType,
  type NodeKind,
  type PluginRow,
  type RefKind,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { KindCatalog } from '../../automations/plugin-kinds/catalog';
import type { AutomationSecrets } from '../../automations/secrets-v3';
import { graphOutline } from '../../automations/service-programs-outline';
import type { AutomationFunctions } from '../../automations/service-functions';
import { localPluginTransport } from '../../plugins/local-transport';
import { StoreNotFoundError } from '../../store/context';
import type { Store } from '../../store/store';
import { roleOfCaller, type Caller } from '../auth';
import { bound } from '../router';

export interface ProgramReadDeps {
  readonly store: Store;
  readonly secrets: Pick<AutomationSecrets, 'list'>;
  readonly functions: Pick<AutomationFunctions, 'list'>;
  readonly kinds: Pick<KindCatalog, 'get' | 'has' | 'kinds'>;
  readonly mcpUrl?: () => string;
}

type CatalogNode = AutomationCatalogReply['nodes'][number];

interface Listed {
  readonly kind: NodeKind;
  readonly off: boolean;
}

const LOOPBACK_CALLBACK = 'http://127.0.0.1';

const SWITCHED_OFF = 'The plugin is switched off.';

const EXTERNAL_PROCESS =
  'The plugin runs as an external local process; automations and the assistant cannot call it.';

const OWNER_ONLY = 'Only the owner can use this node.';

const OBJECT = z.record(z.string(), JSON_VALUE);

function present<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return undefined;
    throw cause;
  }
}

type Namer = (deps: ProgramReadDeps, id: string) => string | undefined;

function deviceName(deps: ProgramReadDeps, id: string): string | undefined {
  const device = deps.store.devices.find(id);
  return device === undefined ? undefined : (device.display_name ?? device.name);
}

const NAMES: Readonly<Record<RefKind, Namer>> = {
  device: deviceName,
  camera: deviceName,
  phone: deviceName,
  computer: deviceName,
  room: (deps, id) => present(() => deps.store.rooms.byId(id).name),
  group: (deps, id) => present(() => deps.store.deviceGroups.byId(id).name),
  scene: (deps, id) => present(() => deps.store.scenes.byId(id).name),
  person: (deps, id) => present(() => deps.store.profiles.byId(id).name),
  chat: (deps, id) => deps.store.aiChats.find(id)?.title ?? undefined,
  value: (deps, id) => present(() => deps.store.automationValues.byId(id).content.name),
  automation: (deps, id) => deps.store.automations.find(id)?.name,
  function: (deps, id) => deps.store.automationFunctions.find(id)?.name,
  secret: (deps, id) => deps.secrets.list().find((secret) => secret.id === id)?.name,
  target: () => undefined,
};

function describeContext(deps: ProgramReadDeps): DescribeContext {
  return {
    kinds: (id) => deps.kinds.get(id),
    names: (kind, id) => NAMES[kind](deps, id),
  };
}

function json(value: unknown): Record<string, z.infer<typeof JSON_VALUE>> {
  return OBJECT.parse(JSON.parse(JSON.stringify(value)));
}

function functionEntry(
  summary: AutomationFunctionSummary,
): AutomationCatalogReply['functions'][number] {
  return {
    kind: summary.id,
    group: summary.category ?? 'reusable',
    meaning: summary.description ?? summary.name,
    inputs: summary.interface.inputs.map(json),
    outputs: summary.interface.outputs.map(json),
  };
}

function listedKinds(deps: ProgramReadDeps): readonly Listed[] {
  const live = deps.kinds.kinds();
  const present = new Set(live.map((kind) => kind.id));
  const switchedOff = deps.store.pluginKinds
    .all()
    .filter((row) => row.status === 'off' && !present.has(row.kind_id))
    .map((row) => row.declaration);
  return [
    ...live.map((kind) => ({ kind, off: false })),
    ...switchedOff.map((kind) => ({ kind, off: true })),
  ];
}

function externalProcess(deps: ProgramReadDeps, plugin: PluginRow): boolean {
  return (
    plugin.source !== 'builtin' &&
    localPluginTransport(plugin.manifest.mcp, deps.mcpUrl?.() ?? LOOPBACK_CALLBACK)
  );
}

function pluginReason(deps: ProgramReadDeps, kind: NodeKind, off: boolean): string | undefined {
  if (off) return SWITCHED_OFF;
  const plugin =
    kind.origin?.kind === 'plugin' ? deps.store.plugins.find(kind.origin.id) : undefined;
  if (plugin === undefined) return undefined;
  if (!plugin.enabled) return SWITCHED_OFF;
  return externalProcess(deps, plugin) ? EXTERNAL_PROCESS : undefined;
}

function unavailableReason(
  deps: ProgramReadDeps,
  listed: Listed,
  owner: boolean,
): string | undefined {
  if (listed.kind.origin === undefined) return undefined;
  if (!owner && listed.kind.access === 'owner') return OWNER_ONLY;
  return pluginReason(deps, listed.kind, listed.off);
}

function implicitSource(type: FlowType): string | undefined {
  if (type.t === 'list' || type.t === 'optional') return implicitSource(type.of);
  if (type.t === 'ref') return `ref:${type.of}`;
  return type.t === 'entity' ? `entity:${type.of}` : undefined;
}

function pickersOf(kind: NodeKind): Readonly<Record<string, string>> {
  const sources = kind.inputs.flatMap((port) => {
    const source = port.ui?.optionsFrom ?? port.ui?.editor ?? implicitSource(port.type);
    return source === undefined ? [] : [[port.name, source] as const];
  });
  return Object.fromEntries(sources);
}

function runsAsStep(kind: NodeKind): boolean {
  return kind.class !== 'pure' && kind.class !== 'trigger';
}

function nodeEntry(deps: ProgramReadDeps, listed: Listed, owner: boolean): CatalogNode {
  const { kind } = listed;
  const pickers = pickersOf(kind);
  const reason = unavailableReason(deps, listed, owner);
  const modes = modesOf(kind);
  return {
    kind: kind.id,
    group: kind.category,
    meaning: kind.description,
    inputs: kind.inputs.map(json),
    outputs: kind.outputs.map(json),
    ...(kind.origin === undefined
      ? {}
      : {
          origin: { kind: kind.origin.kind, id: kind.origin.id, name: kind.origin.name },
          available: reason === undefined,
        }),
    ...(reason === undefined ? {} : { unavailable: reason }),
    ...(runsAsStep(kind)
      ? {
          fallible: fallibleOf(kind, deps.kinds),
          modes: { default: modes.default, allowed: [...modes.allowed] },
        }
      : {}),
    ...(Object.keys(pickers).length === 0 ? {} : { pickers }),
  };
}

function shown(listed: Listed, owner: boolean): boolean {
  const { kind } = listed;
  return (
    SHIPPED_TIERS.includes(kind.tier) &&
    (owner || kind.access === 'member' || kind.origin !== undefined)
  );
}

function catalogueOf(
  deps: ProgramReadDeps,
  query: {
    readonly query?: string | undefined;
    readonly group?: string | undefined;
    readonly kind?: string | undefined;
  },
  caller: Caller,
): AutomationCatalogReply {
  const owner = roleOfCaller(caller) === 'owner';
  const nodes = listedKinds(deps)
    .filter((listed) => shown(listed, owner))
    .filter(({ kind }) => query.kind === undefined || kind.id === query.kind)
    .filter(({ kind }) => query.group === undefined || kind.category === query.group)
    .filter(
      ({ kind }) =>
        query.query === undefined ||
        [kind.id, kind.name, kind.description, ...kind.keywords]
          .join(' ')
          .toLowerCase()
          .includes(query.query.toLowerCase()),
    )
    .map((listed) => nodeEntry(deps, listed, owner));
  const functions = deps.functions
    .list(caller)
    .filter((summary) => query.kind === undefined || summary.id === query.kind)
    .filter((summary) => query.group === undefined || summary.category === query.group)
    .map(functionEntry);
  return { nodes, functions };
}

export const automationProgramReadRoutes = (deps: ProgramReadDeps) =>
  ({
    getAutomationProgram: bound(E.getAutomationProgram, ({ params }) => {
      const row = deps.store.automations.byId(params.automationId);
      return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        enabled: row.enabled,
        program: row.definition,
      };
    }),
    getAutomationProgramOutline: bound(E.getAutomationProgramOutline, ({ params }) => {
      const row = deps.store.automations.byId(params.automationId);
      return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        outline: graphOutline(row.definition, describeContext(deps), deps.kinds),
      };
    }),
    listAutomationCatalog: bound(E.listAutomationCatalog, ({ query, caller }) =>
      catalogueOf(deps, query, caller),
    ),
  }) as const;
