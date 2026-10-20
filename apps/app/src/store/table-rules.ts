import {
  BODY_READINGS_SNAPSHOT,
  AUTOMATION_RUN_HISTORY_LIMIT,
  SNAPSHOT_WINDOWS,
  TALK_MESSAGES_SNAPSHOT,
  pluginStreamKey,
  talkMemberKey,
} from '@smarteverything/domain';
import type { ListTable, RowOf } from './state';
import { compareText } from '../format/text';

export interface TableRule<R> {
  readonly idOf: (row: R) => string;
  readonly order: (left: R, right: R) => number;
  readonly keep: number;
}

const ALL = Number.MAX_SAFE_INTEGER;

function newest<R>(at: (row: R) => string): (left: R, right: R) => number {
  return (left, right) => compareText(at(right), at(left));
}

function alphabetical<R>(at: (row: R) => string): (left: R, right: R) => number {
  return (left, right) => compareText(at(left), at(right));
}

function positioned<R extends { readonly position: number; readonly name: string }>(
  left: R,
  right: R,
): number {
  return left.position - right.position || compareText(left.name, right.name);
}

export function orderedRooms<R extends { readonly position: number; readonly name: string }>(
  rooms: readonly R[],
): readonly R[] {
  return [...rooms].sort(positioned);
}

function devicesOrder(left: RowOf<'devices'>, right: RowOf<'devices'>): number {
  return left.position - right.position || compareText(left.label, right.label);
}

function soonestScheduled(
  left: RowOf<'scheduled_actions'>,
  right: RowOf<'scheduled_actions'>,
): number {
  const leftAt = left.next_at ?? left.finished_at ?? left.updated_at;
  const rightAt = right.next_at ?? right.finished_at ?? right.updated_at;
  if ((left.next_at === null) !== (right.next_at === null)) {
    return left.next_at === null ? 1 : -1;
  }
  return left.next_at === null ? compareText(rightAt, leftAt) : compareText(leftAt, rightAt);
}

type Rules = { readonly [T in ListTable]: TableRule<RowOf<T>> };

export const RULES: Rules = {
  clients: { idOf: (row) => row.id, order: alphabetical((row) => row.created_at), keep: ALL },
  provider_links: {
    idOf: (row) => row.provider,
    order: alphabetical((row) => row.provider),
    keep: ALL,
  },
  rooms: { idOf: (row) => row.id, order: positioned, keep: ALL },
  device_groups: {
    idOf: (row) => row.id,
    order: (a, b) => compareText(a.name, b.name),
    keep: ALL,
  },
  devices: { idOf: (row) => row.id, order: devicesOrder, keep: ALL },
  television_settings: {
    idOf: (row) => row.device_id,
    order: alphabetical((row) => row.device_id),
    keep: ALL,
  },
  commands: {
    idOf: (row) => row.id,
    order: newest((row) => row.created_at),
    keep: SNAPSHOT_WINDOWS.commands,
  },
  events: {
    idOf: (row) => row.id,
    order: newest((row) => row.occurred_at),
    keep: SNAPSHOT_WINDOWS.events,
  },
  cameras: {
    idOf: (row) => row.device_id,
    order: alphabetical((row) => row.stream_name),
    keep: ALL,
  },
  recordings: {
    idOf: (row) => row.id,
    order: newest((row) => row.started_at),
    keep: SNAPSHOT_WINDOWS.recordings,
  },
  ir_remotes: { idOf: (row) => row.id, order: alphabetical((row) => row.name), keep: ALL },
  ir_codes: { idOf: (row) => row.id, order: alphabetical((row) => row.button), keep: ALL },
  scenes: { idOf: (row) => row.id, order: positioned, keep: ALL },
  automations: { idOf: (row) => row.id, order: alphabetical((row) => row.name), keep: ALL },
  automation_values: {
    idOf: (row) => row.id,
    order: alphabetical((row) => row.content.name),
    keep: ALL,
  },
  automation_runs: {
    idOf: (row) => row.id,
    order: newest((row) => row.created_at),
    keep: AUTOMATION_RUN_HISTORY_LIMIT,
  },
  layouts: { idOf: (row) => row.page, order: alphabetical((row) => row.page), keep: ALL },
  push_targets: {
    idOf: (row) => row.token,
    order: alphabetical((row) => row.created_at),
    keep: ALL,
  },
  health_sources: {
    idOf: (row) => row.client_id,
    order: alphabetical((row) => row.name),
    keep: ALL,
  },
  health_daily: {
    idOf: (row) => `${row.day}/${row.metric}`,
    order: newest((row) => `${row.day}/${row.metric}`),
    keep: ALL,
  },
  mcp_tokens: { idOf: (row) => row.id, order: newest((row) => row.created_at), keep: ALL },
  oauth_clients: { idOf: (row) => row.id, order: newest((row) => row.created_at), keep: ALL },
  profiles: { idOf: (row) => row.id, order: positioned, keep: ALL },
  talk_channels: { idOf: (row) => row.id, order: positioned, keep: ALL },
  talk_members: {
    idOf: talkMemberKey,
    order: alphabetical((row) => row.created_at),
    keep: ALL,
  },
  talk_messages: {
    idOf: (row) => row.id,
    order: newest((row) => row.started_at),
    keep: TALK_MESSAGES_SNAPSHOT,
  },
  scheduled_actions: { idOf: (row) => row.id, order: soonestScheduled, keep: ALL },
  ai_chats: {
    idOf: (row) => row.id,
    order: (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      compareText(
        right.last_message_at ?? right.created_at,
        left.last_message_at ?? left.created_at,
      ),
    keep: ALL,
  },
  assistant_messages: {
    idOf: (row) => row.id,
    order: newest((row) => row.created_at),
    keep: ALL,
  },
  ai_usage: {
    idOf: (row) => row.id,
    order: newest((row) => row.at),
    keep: 500,
  },
  plugins: { idOf: (row) => row.id, order: alphabetical((row) => row.manifest.name), keep: ALL },
  plugin_streams: {
    idOf: (row) => pluginStreamKey(row.plugin_id, row.stream),
    order: alphabetical((row) => pluginStreamKey(row.plugin_id, row.stream)),
    keep: ALL,
  },
  plugin_ui: { idOf: (row) => row.id, order: alphabetical((row) => row.name), keep: ALL },
  body_readings: {
    idOf: (row) => row.id,
    order: newest((row) => row.measured_at),
    keep: BODY_READINGS_SNAPSHOT,
  },
};
