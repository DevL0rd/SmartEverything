import {
  API_ENDPOINTS as E,
  JSON_VALUE,
  NODE_REGISTRY,
  SHIPPED_TIERS,
  outlineOf,
  type AutomationCatalogReply,
  type AutomationFunctionSummary,
  type DescribeContext,
  type RefKind,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { AutomationSecrets } from '../../automations/secrets-v3';
import type { AutomationFunctions } from '../../automations/service-functions';
import { StoreNotFoundError } from '../../store/context';
import type { Store } from '../../store/store';
import { roleOfCaller, type Caller } from '../auth';
import { bound } from '../router';

export interface ProgramReadDeps {
  readonly store: Store;
  readonly secrets: Pick<AutomationSecrets, 'list'>;
  readonly functions: Pick<AutomationFunctions, 'list'>;
}

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
    kinds: (id) => NODE_REGISTRY.get(id),
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
  const nodes = NODE_REGISTRY.kinds
    .filter((kind) => SHIPPED_TIERS.includes(kind.tier) && (owner || kind.access === 'member'))
    .filter((kind) => query.kind === undefined || kind.id === query.kind)
    .filter((kind) => query.group === undefined || kind.category === query.group)
    .filter(
      (kind) =>
        query.query === undefined ||
        [kind.id, kind.name, kind.description, ...kind.keywords]
          .join(' ')
          .toLowerCase()
          .includes(query.query.toLowerCase()),
    )
    .map((kind) => ({
      kind: kind.id,
      group: kind.category,
      meaning: kind.description,
      inputs: kind.inputs.map(json),
      outputs: kind.outputs.map(json),
    }));
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
        outline: outlineOf(row.definition, describeContext(deps)),
      };
    }),
    listAutomationCatalog: bound(E.listAutomationCatalog, ({ query, caller }) =>
      catalogueOf(deps, query, caller),
    ),
  }) as const;
