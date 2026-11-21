import {
  API_ENDPOINTS as E,
  JSON_VALUE,
  SHIPPED_TIERS,
  fallibleOf,
  modesOf,
  type AutomationCatalogReply,
  type AutomationFunctionSummary,
  type FlowType,
  type NodeKind,
  type PluginRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { KindCatalog } from '../../automations/plugin-kinds/catalog';
import type { AutomationSecrets } from '../../automations/secrets-v3';
import type { AutomationFunctions } from '../../automations/service-functions';
import { localPluginTransport } from '../../plugins/local-transport';
import type { Store } from '../../store/store';
import { roleOfCaller, type Caller } from '../auth';
import { bound } from '../router';
import type { CatalogueFacts } from './automation-program-units';
import { contributedKinds } from './automation-value-units';

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

type JsonObject = Record<string, z.infer<typeof JSON_VALUE>>;

function json(value: unknown): JsonObject {
  return OBJECT.parse(JSON.parse(JSON.stringify(value)));
}

const PORT_JSON = new WeakMap<object, JsonObject>();

function portJson(port: object): JsonObject {
  const known = PORT_JSON.get(port);
  if (known !== undefined) return known;
  const converted = json(port);
  PORT_JSON.set(port, converted);
  return converted;
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

function listedKinds(live: readonly NodeKind[], facts: CatalogueFacts): readonly Listed[] {
  return [
    ...live.map((kind) => ({ kind, off: false })),
    ...facts.switchedOff.map((kind) => ({ kind, off: true })),
  ];
}

function externalProcess(deps: ProgramReadDeps, plugin: PluginRow): boolean {
  return (
    plugin.source !== 'builtin' &&
    localPluginTransport(plugin.manifest.mcp, deps.mcpUrl?.() ?? LOOPBACK_CALLBACK)
  );
}

function pluginReason(
  deps: ProgramReadDeps,
  facts: CatalogueFacts,
  kind: NodeKind,
  off: boolean,
): string | undefined {
  if (off) return SWITCHED_OFF;
  const plugin = kind.origin?.kind === 'plugin' ? facts.plugins[kind.origin.id] : undefined;
  if (plugin === undefined) return undefined;
  if (!plugin.enabled) return SWITCHED_OFF;
  return externalProcess(deps, plugin) ? EXTERNAL_PROCESS : undefined;
}

function unavailableReason(
  deps: ProgramReadDeps,
  facts: CatalogueFacts,
  listed: Listed,
  owner: boolean,
): string | undefined {
  if (listed.kind.origin === undefined) return undefined;
  if (!owner && listed.kind.access === 'owner') return OWNER_ONLY;
  return pluginReason(deps, facts, listed.kind, listed.off);
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

function nodeEntry(
  deps: ProgramReadDeps,
  facts: CatalogueFacts,
  listed: Listed,
  owner: boolean,
): CatalogNode {
  const { kind } = listed;
  const pickers = pickersOf(kind);
  const reason = unavailableReason(deps, facts, listed, owner);
  const modes = modesOf(kind);
  return {
    kind: kind.id,
    group: kind.category,
    meaning: kind.description,
    inputs: kind.inputs.map(portJson),
    outputs: kind.outputs.map(portJson),
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

async function catalogueOf(
  deps: ProgramReadDeps,
  query: {
    readonly query?: string | undefined;
    readonly group?: string | undefined;
    readonly kind?: string | undefined;
  },
  caller: Caller,
): Promise<AutomationCatalogReply> {
  const owner = roleOfCaller(caller) === 'owner';
  const live = deps.kinds.kinds();
  const facts = await deps.store.host.read('automationCatalogueFacts', {
    liveIds: live.map((kind) => kind.id),
    pluginIds: [
      ...new Set(live.flatMap((kind) => (kind.origin?.kind === 'plugin' ? [kind.origin.id] : []))),
    ],
  });
  const nodes = listedKinds(live, facts)
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
    .map((listed) => nodeEntry(deps, facts, listed, owner));
  const functions = (await deps.functions.list(caller))
    .filter((summary) => query.kind === undefined || summary.id === query.kind)
    .filter((summary) => query.group === undefined || summary.category === query.group)
    .map(functionEntry);
  return { nodes, functions };
}

export const automationProgramReadRoutes = (deps: ProgramReadDeps) =>
  ({
    getAutomationProgram: bound(E.getAutomationProgram, async ({ params }) => {
      const row = await deps.store.host.call('automations', 'byId', params.automationId);
      return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        enabled: row.enabled,
        program: row.definition,
      };
    }),
    getAutomationProgramOutline: bound(E.getAutomationProgramOutline, ({ params }) =>
      deps.store.host.read('automationProgramOutline', {
        automationId: params.automationId,
        kinds: contributedKinds(deps.kinds),
        secrets: deps.secrets.list().map(({ id, name }) => ({ id, name })),
      }),
    ),
    listAutomationCatalog: bound(E.listAutomationCatalog, ({ query, caller }) =>
      catalogueOf(deps, query, caller),
    ),
  }) as const;
