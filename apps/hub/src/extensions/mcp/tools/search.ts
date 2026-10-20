import {
  CAPABILITY_CATALOGUE,
  CLIENT_PREF_KEYS,
  HEALTH_METRICS,
  HEALTH_RECORD_TYPES,
  NODE_REGISTRY,
  programKeywords,
  searchTitles,
  type AutomationRowV3,
  type DeviceScope,
  type NavTarget,
} from '@smarteverything/domain';
import { z } from 'zod';
import { deviceHidden, deviceIdReachable } from '../../../server/person-scope';
import { sceneDeviceIds } from '../../../server/snapshot-reach';
import type { Store } from '../../../store/store';
import { listedDevices } from './devices';
import { deviceScopeOfActor } from './person-reach';
import { READS, defineTool, matches, type Tool } from './registry';

const SEARCH = z.strictObject({
  query: z.string().min(1).max(100).describe('Words to look for'),
  limit: z.number().int().min(1).max(50).default(10).describe('At most this many of each kind'),
});

type Search = z.infer<typeof SEARCH>;

const kinds = (id: string): ReturnType<typeof NODE_REGISTRY.get> => NODE_REGISTRY.get(id);

function automationTarget(id: string, focus: string | null): NavTarget {
  return { kind: 'automation', automationId: id, focus };
}

function nodeHits(
  row: AutomationRowV3,
  query: string,
): { id: string; title: string; target: NavTarget }[] {
  return searchTitles(row.definition, kinds)
    .filter((entry) => matches(query, entry.title, entry.key, ...entry.keywords))
    .map((entry) => ({
      id: entry.nodeId,
      title: entry.title,
      target: automationTarget(row.id, `node:${entry.nodeId}`),
    }));
}

export function automationHits(store: Store, { query, limit }: Search): Record<string, unknown>[] {
  return store.automations
    .list()
    .flatMap((row) => {
      const nodes = nodeHits(row, query);
      const named = matches(query, row.name, ...programKeywords(row.definition, kinds));
      return named || nodes.length > 0
        ? [
            {
              id: row.id,
              name: row.name,
              enabled: row.enabled,
              target: automationTarget(row.id, null),
              ...(nodes.length === 0 ? {} : { nodes: nodes.slice(0, limit) }),
            },
          ]
        : [];
    })
    .slice(0, limit);
}

function homeHits(
  store: Store,
  scope: DeviceScope | null,
  { query, limit }: Search,
): Record<string, unknown> {
  return {
    devices: listedDevices(store, scope, { search: query, includeHidden: false, limit }),
    rooms: store.rooms
      .list()
      .filter((room) => matches(query, room.name))
      .slice(0, limit)
      .map((room) => ({ id: room.id, name: room.name })),
    scenes: store.scenes
      .list()
      .filter(
        (scene) =>
          matches(query, scene.name) &&
          sceneDeviceIds(scene.actions).every((id) => deviceIdReachable(store, scope, id)),
      )
      .slice(0, limit)
      .map((scene) => ({ id: scene.id, name: scene.name })),
    automations: automationHits(store, { query, limit }),
    values: store.automationValues
      .list()
      .filter((value) => matches(query, value.content.name, value.content.kind, 'value'))
      .slice(0, limit)
      .map((value) => ({ id: value.id, name: value.content.name, kind: value.content.kind })),
    remotes: store.infrared
      .remotes()
      .filter(
        (remote) =>
          matches(query, remote.name, remote.category, remote.brand) &&
          deviceIdReachable(store, scope, remote.blaster_id),
      )
      .slice(0, limit)
      .map((remote) => ({ id: remote.id, name: remote.name, category: remote.category })),
    people: store.profiles
      .list()
      .filter((profile) => matches(query, profile.name))
      .map((profile) => ({ id: profile.id, name: profile.name })),
  };
}

function capabilityHits(
  store: Store,
  scope: DeviceScope | null,
  { query, limit }: Search,
): Record<string, unknown>[] {
  const devices = store.devices.list().filter((device) => !deviceHidden(scope, device));
  return Object.entries(CAPABILITY_CATALOGUE)
    .filter(([key, entry]) => matches(query, key, entry.label, entry.group, ...entry.keywords))
    .slice(0, limit)
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      devices: devices.filter((device) =>
        device.capabilities.some((capability) => capability.key === key),
      ).length,
    }));
}

function appHits({ query, limit }: Search): Record<string, unknown> {
  return {
    preferences: CLIENT_PREF_KEYS.filter((key) => matches(query, key)),
    health_types: HEALTH_RECORD_TYPES.filter((type) => matches(query, type)).slice(0, limit),
    health_metrics: HEALTH_METRICS.filter((metric) => matches(query, metric)).slice(0, limit),
  };
}

export const SEARCH_TOOL: Tool = defineTool({
  name: 'search_everything',
  input: SEARCH,
  annotations: READS,
  run: (context, input) => {
    const scope = deviceScopeOfActor(context);
    return {
      structured: {
        ...homeHits(context.store, scope, input),
        capabilities: capabilityHits(context.store, scope, input),
        ...appHits(input),
      },
    };
  },
});
