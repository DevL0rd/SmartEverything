import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText, type Sql } from '../sql';
import type { Migration } from './migration';
import type { StoredCall } from './tool-scheme-calls';
import { moveStoredCalls } from './tool-scheme';

type Args = Readonly<Record<string, unknown>>;

const OLD_CONTROL = 'group_control';
const CONTROL = 'device_control';

const CHANGE = z.looseObject({ target: z.looseObject({}), capability: z.string() });
const CHANGES = z.array(CHANGE);
const ROOM_TARGET = z.looseObject({
  kind: z.literal('room'),
  roomId: z.string(),
  families: z.array(z.string()).optional(),
});
const GROUP_TARGET = z.looseObject({ kind: z.literal('group'), groupId: z.string() });
const DEVICES_TARGET = z.looseObject({ kind: z.literal('devices'), deviceIds: z.array(z.string()) });
const TEXT_ROW = z.object({ id: z.string(), text: z.string() });
const NAMES = z.array(z.string());

function flatTarget(target: Args): Args {
  const room = ROOM_TARGET.safeParse(target);
  if (room.success) {
    return {
      rooms: [room.data.roomId],
      ...(room.data.families === undefined ? {} : { families: room.data.families }),
    };
  }
  const group = GROUP_TARGET.safeParse(target);
  if (group.success) return { group: group.data.groupId };
  const devices = DEVICES_TARGET.safeParse(target);
  return devices.success ? { deviceIds: devices.data.deviceIds } : target;
}

function flatChange(change: Args, target: Args): Args {
  const { target: _target, ...rest } = change;
  return { ...flatTarget(target), ...rest };
}

export function flatControl(call: StoredCall): StoredCall | null {
  if (call.tool === OLD_CONTROL) {
    const { target, ...rest } = call.args;
    const kept = typeof target === 'object' && target !== null ? flatTarget(target) : {};
    return { tool: CONTROL, args: { ...kept, ...rest } };
  }
  if (call.tool !== CONTROL || !('changes' in call.args)) {
    return null;
  }
  const changes = CHANGES.parse(call.args['changes']);
  const [only, ...more] = changes;
  if (only === undefined || more.length > 0) {
    throw new Error(
      'A stored device_control call has several changes or none; device_control now takes one change per call. Split it into one call per change in the app, then start the hub again.',
    );
  }
  return { tool: CONTROL, args: flatChange(only, only.target) };
}

function withoutOldControl(names: readonly string[]): string[] {
  return [...new Set(names.map((name) => (name === OLD_CONTROL ? CONTROL : name)))];
}

function moveGrants(sql: Sql, label: string, select: string, update: string): number {
  let moved = 0;
  for (const row of sql.all(TEXT_ROW, select)) {
    const names = NAMES.safeParse(JSON.parse(row.text));
    if (!names.success || !names.data.includes(OLD_CONTROL)) continue;
    moved += sql.run(label, update, {
      id: row.id,
      names: jsonText(withoutOldControl(names.data)),
    });
  }
  return moved;
}

function moveControlNames(sql: Sql): LogPayload {
  return {
    disabled: moveGrants(
      sql,
      'name the switched-off control tool by device_control',
      "select '1' as id, mcp_disabled_tools as text from settings",
      'update settings set mcp_disabled_tools = $names',
    ),
    chats: moveGrants(
      sql,
      'name a chat’s control tool grant by device_control',
      'select id, tools as text from ai_chats where tools is not null',
      'update ai_chats set tools = $names where id = $id',
    ),
    messages: moveGrants(
      sql,
      'name a message’s control step by device_control',
      "select id, steps as text from assistant_messages where steps != '[]'",
      'update assistant_messages set steps = $names where id = $id',
    ),
  };
}

export function moveDeviceControl(sql: Sql): LogPayload {
  return { ...moveStoredCalls(sql, flatControl), ...moveControlNames(sql) };
}

export const DEVICE_CONTROL_FLAT_MIGRATION: Migration = {
  version: 137,
  name: 'device_control_flat',
  statements: [],
  backfill: moveDeviceControl,
};
