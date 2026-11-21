import {
  CAPABILITY_CATALOGUE,
  CLIENT_PREF_KEYS,
  HEALTH_METRICS,
  HEALTH_RECORD_TYPES,
  PLANNER_SEARCH_PAGE,
  programKeywords,
  searchTitles,
  type NodeKindLookup,
  type StoredAutomationRow,
  type DeviceScope,
  type NavTarget,
} from '@smarteverything/domain';
import { z } from 'zod';
import { shortcutsForQuery } from '../../../drive/social/shortcuts';
import { driveHits, type DriveHit } from '../../../drive/search-provider';
import type { DriveActor } from '../../../drive/access';
import { deviceHidden } from '../../../server/person-scope';
import { flatAutomation } from '../../../store/repositories/automation-trees';
import type { Store } from '../../../store/store';
import { operate, profileFor, type OperatingContext } from './acting';
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

export async function automationHits(
  store: Pick<Store, 'host'>,
  { query, limit }: Search,
  kinds: NodeKindLookup,
): Promise<Record<string, unknown>[]> {
  return (await store.host.call('automations', 'list'))
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

async function homeHits(
  store: Store,
  scope: DeviceScope | null,
  { query, limit }: Search,
  kinds: NodeKindLookup,
): Promise<Record<string, unknown>> {
  const rows = await store.host.read('mcpSearchRows', scope);
  return {
    devices: await listedDevices(store, scope, { search: query, includeHidden: false, limit }),
    rooms: rows.rooms
      .filter((room) => matches(query, room.name))
      .slice(0, limit)
      .map((room) => ({ id: room.id, name: room.name })),
    automations: await automationHits(store, { query, limit }, kinds),
    values: rows.values
      .filter((value) => matches(query, value.content.name, value.content.kind, 'value'))
      .slice(0, limit)
      .map((value) => ({ id: value.id, name: value.content.name, kind: value.content.kind })),
    remotes: rows.remotes
      .filter((remote) => matches(query, remote.name, remote.category, remote.brand))
      .slice(0, limit)
      .map((remote) => ({ id: remote.id, name: remote.name, category: remote.category })),
    people: rows.people
      .filter((profile) => matches(query, profile.name))
      .map((profile) => ({ id: profile.id, name: profile.name })),
  };
}

async function capabilityHits(
  store: Store,
  scope: DeviceScope | null,
  { query, limit }: Search,
): Promise<Record<string, unknown>[]> {
  const devices = (await store.host.call('devices', 'list')).filter(
    (device) => !deviceHidden(scope, device),
  );
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

async function driveActorOf(context: ToolContext): Promise<DriveActor> {
  return { profileId: await profileFor(context, {}) };
}

async function fileHits(context: ToolContext, { query, limit }: Search): Promise<DriveHit[]> {
  const areas = reachableAreas(context);
  if (areas !== undefined && !areas.includes('drive')) {
    return [];
  }
  const { store } = context;
  return driveHits(
    (viewer, request, size) => store.host.call('driveSearch', 'search', viewer, request, size),
    await driveActorOf(context),
    { query, limit },
    (viewer, request) => shortcutsForQuery(store, viewer, request),
  );
}

function plannerItemTarget(itemId: string): NavTarget {
  return { kind: 'page', path: `planner/item/${itemId}` };
}

export async function plannerHits(
  context: OperatingContext,
  { query, limit }: Search,
): Promise<Record<string, unknown>[]> {
  const areas = reachableAreas(context);
  if (areas !== undefined && !areas.includes('planner')) {
    return [];
  }
  const page = PLANNER_SEARCH_PAGE.parse(
    await operate(context, 'readPlannerSearch', { query: { text: query } }),
  );
  return page.hits.slice(0, limit).map(({ occurrence, reading, matched }) => ({
    id: occurrence.item_id,
    occurrence_key: occurrence.occurrence_key,
    title: occurrence.title,
    kind: occurrence.kind,
    start: occurrence.start,
    due_at: occurrence.due_at,
    status: occurrence.status,
    reading,
    matched,
    target: plannerItemTarget(occurrence.item_id),
  }));
}

export const SEARCH_TOOL: Tool = defineTool({
  name: 'home_search',
  input: SEARCH,
  annotations: READS,
  run: async (context, input) => {
    const scope = deviceScopeOfActor(context);
    return {
      structured: {
        ...(await homeHits(context.store, scope, input, context.hub.automationKinds)),
        files: await fileHits(context, input),
        planner: await plannerHits(context, input),
        capabilities: await capabilityHits(context.store, scope, input),
        ...appHits(input),
      },
    };
  },
});
