import {
  CAPABILITY_CATALOGUE,
  CLIENT_PREF_KEYS,
  HEALTH_METRICS,
  HEALTH_RECORD_TYPES,
  MCP_TOOLS,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { listedDevices } from './devices';
import { CALLABLE_OPERATIONS, operationShape } from './operation-shape';
import { READS, defineTool, matches, type Tool } from './registry';

const SEARCH = z.strictObject({
  query: z.string().min(1).max(100).describe('Words to look for'),
  limit: z.number().int().min(1).max(50).default(10).describe('At most this many of each kind'),
});

type Search = z.infer<typeof SEARCH>;

function homeHits(store: Store, { query, limit }: Search): Record<string, unknown> {
  return {
    devices: listedDevices(store, { search: query, includeHidden: false, limit }),
    rooms: store.rooms
      .list()
      .filter((room) => matches(query, room.name))
      .slice(0, limit)
      .map((room) => ({ id: room.id, name: room.name })),
    scenes: store.scenes
      .list()
      .filter((scene) => matches(query, scene.name))
      .slice(0, limit)
      .map((scene) => ({ id: scene.id, name: scene.name })),
    automations: store.automations
      .list()
      .filter((automation) => matches(query, automation.name))
      .slice(0, limit)
      .map((automation) => ({
        id: automation.id,
        name: automation.name,
        enabled: automation.enabled,
      })),
    sequences: store.automationSequences
      .list()
      .filter((sequence) => matches(query, sequence.name, 'sequence', 'reusable'))
      .slice(0, limit)
      .map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
        parameters: sequence.definition.parameters,
      })),
    values: store.automationValues
      .list()
      .filter((value) => matches(query, value.content.name, value.content.kind, 'value'))
      .slice(0, limit)
      .map((value) => ({ id: value.id, name: value.content.name, kind: value.content.kind })),
    remotes: store.infrared
      .remotes()
      .filter((remote) => matches(query, remote.name, remote.category, remote.brand))
      .slice(0, limit)
      .map((remote) => ({ id: remote.id, name: remote.name, category: remote.category })),
    people: store.profiles
      .list()
      .filter((profile) => matches(query, profile.name))
      .map((profile) => ({ id: profile.id, name: profile.name })),
  };
}

function capabilityHits(store: Store, { query, limit }: Search): Record<string, unknown>[] {
  const devices = store.devices.list();
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
    tools: MCP_TOOLS.filter((tool) => matches(query, tool.name, tool.title, tool.description))
      .slice(0, limit)
      .map((tool) => ({ name: tool.name, title: tool.title })),
    operations: CALLABLE_OPERATIONS.filter((name) =>
      matches(query, name, operationShape(name).endpoint.summary),
    ).slice(0, limit),
    preferences: CLIENT_PREF_KEYS.filter((key) => matches(query, key)),
    health_types: HEALTH_RECORD_TYPES.filter((type) => matches(query, type)).slice(0, limit),
    health_metrics: HEALTH_METRICS.filter((metric) => matches(query, metric)).slice(0, limit),
  };
}

export const SEARCH_TOOL: Tool = defineTool({
  name: 'search_everything',
  input: SEARCH,
  annotations: READS,
  run: ({ store }, input) => ({
    structured: {
      ...homeHits(store, input),
      capabilities: capabilityHits(store, input),
      ...appHits(input),
    },
  }),
});
