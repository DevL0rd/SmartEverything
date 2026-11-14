import { DeviceValueIndex } from './device-values';
import { makeTable, type DeviceValues, type Table, type Tables } from './state';
import type { PlannerTables } from './planner-tables';
import { sameJson } from './same-json';

function shareTable<R>(previous: Table<R>, table: Table<R>): Table<R> {
  let reused = previous.ids.length === table.ids.length;
  const byId: Record<string, R> = {};
  table.ids.forEach((id, index) => {
    const row = table.byId[id];
    const before = previous.byId[id];
    if (row === undefined) {
      return;
    }
    const keep = before !== undefined && sameJson(before, row);
    byId[id] = keep ? before : row;
    reused &&= keep && previous.ids[index] === id;
  });
  return reused ? previous : makeTable(byId, table.ids, table.version);
}

export function shareValues(previous: DeviceValueIndex, next: DeviceValueIndex): DeviceValueIndex {
  let reused = previous.size === next.size;
  const merged: [string, DeviceValues][] = [];
  for (const [deviceId, values] of next.entries()) {
    const before = previous.get(deviceId);
    const keep = before !== undefined && sameJson(before, values);
    merged.push([deviceId, keep ? before : values]);
    reused &&= keep;
  }
  return reused ? previous : DeviceValueIndex.from(merged);
}

function shareModelAndPlannerTables(
  previous: Tables,
  next: Tables,
): PlannerTables & Pick<Tables, 'model_assets' | 'model_catalog' | 'model_overrides'> {
  return {
    model_assets: shareTable(previous.model_assets, next.model_assets),
    model_catalog: shareTable(previous.model_catalog, next.model_catalog),
    model_overrides: shareTable(previous.model_overrides, next.model_overrides),
    planner_collections: shareTable(previous.planner_collections, next.planner_collections),
    planner_items: shareTable(previous.planner_items, next.planner_items),
    planner_occurrences: shareTable(previous.planner_occurrences, next.planner_occurrences),
    planner_alarms: shareTable(previous.planner_alarms, next.planner_alarms),
    planner_timers: shareTable(previous.planner_timers, next.planner_timers),
    planner_stopwatches: shareTable(previous.planner_stopwatches, next.planner_stopwatches),
    google_accounts: shareTable(previous.google_accounts, next.google_accounts),
  };
}

function shareDriveTables(
  previous: Tables,
  next: Tables,
): Pick<Tables, 'drive_roots' | 'drive_albums' | 'drive_grants' | 'drive_placements'> {
  return {
    drive_roots: shareTable(previous.drive_roots, next.drive_roots),
    drive_albums: shareTable(previous.drive_albums, next.drive_albums),
    drive_grants: shareTable(previous.drive_grants, next.drive_grants),
    drive_placements: shareTable(previous.drive_placements, next.drive_placements),
  };
}

export function shareTables(previous: Tables, next: Tables): Tables {
  const shared: Tables = {
    clients: shareTable(previous.clients, next.clients),
    provider_links: shareTable(previous.provider_links, next.provider_links),
    rooms: shareTable(previous.rooms, next.rooms),
    device_groups: shareTable(previous.device_groups, next.device_groups),
    devices: shareTable(previous.devices, next.devices),
    television_settings: shareTable(previous.television_settings, next.television_settings),
    commands: shareTable(previous.commands, next.commands),
    events: shareTable(previous.events, next.events),
    cameras: shareTable(previous.cameras, next.cameras),
    recordings: shareTable(previous.recordings, next.recordings),
    ir_remotes: shareTable(previous.ir_remotes, next.ir_remotes),
    ir_codes: shareTable(previous.ir_codes, next.ir_codes),
    scenes: shareTable(previous.scenes, next.scenes),
    automations: shareTable(previous.automations, next.automations),
    automation_values: shareTable(previous.automation_values, next.automation_values),
    automation_runs: shareTable(previous.automation_runs, next.automation_runs),
    automation_plugin_kinds: shareTable(
      previous.automation_plugin_kinds,
      next.automation_plugin_kinds,
    ),
    layouts: shareTable(previous.layouts, next.layouts),
    push_targets: shareTable(previous.push_targets, next.push_targets),
    health_sources: shareTable(previous.health_sources, next.health_sources),
    health_daily: shareTable(previous.health_daily, next.health_daily),
    mcp_tokens: shareTable(previous.mcp_tokens, next.mcp_tokens),
    oauth_clients: shareTable(previous.oauth_clients, next.oauth_clients),
    profiles: shareTable(previous.profiles, next.profiles),
    body_readings: shareTable(previous.body_readings, next.body_readings),
    talk_channels: shareTable(previous.talk_channels, next.talk_channels),
    talk_members: shareTable(previous.talk_members, next.talk_members),
    talk_messages: shareTable(previous.talk_messages, next.talk_messages),
    assistant_messages: shareTable(previous.assistant_messages, next.assistant_messages),
    ai_chats: shareTable(previous.ai_chats, next.ai_chats),
    scheduled_actions: shareTable(previous.scheduled_actions, next.scheduled_actions),
    ai_usage: shareTable(previous.ai_usage, next.ai_usage),
    plugins: shareTable(previous.plugins, next.plugins),
    plugin_streams: shareTable(previous.plugin_streams, next.plugin_streams),
    plugin_ui: shareTable(previous.plugin_ui, next.plugin_ui),
    ...shareModelAndPlannerTables(previous, next),
    ...shareDriveTables(previous, next),
  };
  return Object.keys(shared).every(
    (name) => Reflect.get(shared, name) === Reflect.get(previous, name),
  )
    ? previous
    : shared;
}

export function shareOf<T>(previous: T, next: T): T {
  return sameJson(previous, next) ? previous : next;
}
