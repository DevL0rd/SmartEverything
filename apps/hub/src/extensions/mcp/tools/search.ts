import {
  CAPABILITY_CATALOGUE,
  CLIENT_PREF_KEYS,
  HEALTH_METRICS,
  HEALTH_RECORD_TYPES,
  programKeywords,
  searchTitles,
  type NodeKindLookup,
  type StoredAutomationRow,
  type DeviceScope,
  type NavTarget,
} from '@smarteverything/domain';
import { z } from 'zod';
import { driveHits, type DriveHit } from '../../../drive/search-provider';
import type { DriveActor } from '../../../drive/access';
import { deviceHidden, deviceIdReachable } from '../../../server/person-scope';
import { sceneDeviceIds } from '../../../server/snapshot-reach';
import { flatAutomation } from '../../../store/repositories/automation-trees';
import type { Store } from '../../../store/store';
import { profileFor, type ActingContext } from './acting';
import { listedDevices } from './devices';
import { deviceScopeOfActor, reachableAreas } from './person-reach';
import { READS, defineTool, matches, type Tool, type ToolContext } from './registry';

const SEARCH = z.strictObject({
  query: z.string().min(1).max(100).describe('Words to look for'),
  limit: z.number().int().min(1).max(50).default(10).describe('At most this many of each kind'),
});

type Search = z.infer<typeof SEARCH>;

function automationTarget(id: string, focus: string | null): NavTarget {
  return { kind: 'automation', automationId: id, focus };
}

function nodeHits(
  row: StoredAutomationRow,
  query: string,
  kinds: NodeKindLookup,
): { id: string; title: string; target: NavTarget }[] {
  return searchTitles(flatAutomation(row.definition), (id) => kinds.get(id))
    .filter((entry) => matches(query, entry.title, entry.key, ...entry.keywords))
    .map((entry) => ({
      id: entry.nodeId,
      title: entry.title,
      target: automationTarget(row.id, `node:${entry.nodeId}`),
    }));
}

export function automationHits(
  store: Store,
  { query, limit }: Search,
  kinds: NodeKindLookup,
): Record<string, unknown>[] {
  return store.automations
    .list()
    .flatMap((row) => {
      const nodes = nodeHits(row, query, kinds);
      const named = matches(
        query,
        row.name,
        ...programKeywords(flatAutomation(row.definition), (id) => kinds.get(id)),
      );
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
  kinds: NodeKindLookup,
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
    automations: automationHits(store, { query, limit }, kinds),
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

function driveActorOf(context: ToolContext): DriveActor {
  return { profileId: profileFor(context, {}) };
}

function fileHits(context: ToolContext, { query, limit }: Search): DriveHit[] {
  const areas = reachableAreas(context);
  if (areas !== undefined && !areas.includes('drive')) {
    return [];
  }
  return driveHits(context.store.driveSearch, driveActorOf(context), { query, limit });
}

function plannerItemTarget(itemId: string): NavTarget {
  return { kind: 'page', path: `planner/item/${itemId}` };
}

export function plannerHits(
  context: ActingContext,
  { query, limit }: Search,
): Record<string, unknown>[] {
  const areas = reachableAreas(context);
  if (areas !== undefined && !areas.includes('planner')) {
    return [];
  }
  return context.store.plannerItems
    .list(profileFor(context, {}))
    .filter((item) => matches(query, item.title, item.notes, item.location))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      start: item.start,
      target: plannerItemTarget(item.id),
    }));
}

export const SEARCH_TOOL: Tool = defineTool({
  name: 'home_search',
  input: SEARCH,
  annotations: READS,
  run: (context, input) => {
    const scope = deviceScopeOfActor(context);
    return {
      structured: {
        ...homeHits(context.store, scope, input, context.hub.automationKinds),
        files: fileHits(context, input),
        planner: plannerHits(context, input),
        capabilities: capabilityHits(context.store, scope, input),
        ...appHits(input),
      },
    };
  },
});
