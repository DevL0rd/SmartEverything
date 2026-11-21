import {
  NODE_REGISTRY,
  type DescribeContext,
  type NodeKind,
  type NodeKindLookup,
  type PluginRow,
  type RefKind,
} from '@smarteverything/domain';
import { graphOutline } from '../../automations/service-programs-outline';
import { storeUnit } from '../../store/host/unit';
import { StoreNotFoundError } from '../../store/context';
import type { HostStore } from '../../store/host/host-store';

export interface SecretName {
  readonly id: string;
  readonly name: string;
}

export interface OutlineAsk {
  readonly automationId: string;
  readonly kinds: readonly NodeKind[];
  readonly secrets: readonly SecretName[];
}

export interface CatalogueAsk {
  readonly liveIds: readonly string[];
  readonly pluginIds: readonly string[];
}

export interface CatalogueFacts {
  readonly switchedOff: readonly NodeKind[];
  readonly plugins: Readonly<Record<string, PluginRow>>;
}

function present<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return undefined;
    throw cause;
  }
}

type Namer = (store: HostStore, id: string, secrets: readonly SecretName[]) => string | undefined;

function deviceName(store: HostStore, id: string): string | undefined {
  const device = store.devices.find(id);
  return device === undefined ? undefined : (device.display_name ?? device.name);
}

const NAMES: Readonly<Record<RefKind, Namer>> = {
  device: deviceName,
  camera: deviceName,
  phone: deviceName,
  computer: deviceName,
  room: (store, id) => present(() => store.rooms.byId(id).name),
  group: (store, id) => present(() => store.deviceGroups.byId(id).name),
  person: (store, id) => present(() => store.profiles.byId(id).name),
  chat: (store, id) => store.aiChats.find(id)?.title ?? undefined,
  value: (store, id) => present(() => store.automationValues.byId(id).content.name),
  automation: (store, id) => store.automations.find(id)?.name,
  function: (store, id) => store.automationFunctions.find(id)?.name,
  secret: (_store, id, secrets) => secrets.find((secret) => secret.id === id)?.name,
  target: () => undefined,
};

function lookupOf(contributed: readonly NodeKind[]): NodeKindLookup {
  const byId = new Map(contributed.map((kind) => [kind.id, kind] as const));
  return {
    get: (id) => NODE_REGISTRY.get(id) ?? byId.get(id),
    has: (id) => NODE_REGISTRY.has(id) || byId.has(id),
  };
}

export const AUTOMATION_PROGRAM_READ_UNITS = {
  automationProgramOutline: storeUnit((store, ask: OutlineAsk) => {
    const row = store.automations.byId(ask.automationId);
    const kinds = lookupOf(ask.kinds);
    const context: DescribeContext = {
      kinds: (id) => kinds.get(id),
      names: (kind, id) => NAMES[kind](store, id, ask.secrets),
    };
    return {
      id: row.id,
      name: row.name,
      revision: row.revision,
      outline: graphOutline(row.definition, context, kinds),
    };
  }),
  automationCatalogueFacts: storeUnit((store, ask: CatalogueAsk): CatalogueFacts => {
    const live = new Set(ask.liveIds);
    const plugins: Record<string, PluginRow> = {};
    for (const id of ask.pluginIds) {
      const plugin = store.plugins.find(id);
      if (plugin !== undefined) plugins[id] = plugin;
    }
    return {
      switchedOff: store.pluginKinds
        .all()
        .filter((row) => row.status === 'off' && !live.has(row.kind_id))
        .map((row) => row.declaration),
      plugins,
    };
  }),
} as const;
