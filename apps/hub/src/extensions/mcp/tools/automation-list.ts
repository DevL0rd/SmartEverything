import type { AutomationRowV3, RoomRow } from '@smarteverything/domain';
import { z } from 'zod';
import { OFFSET, moreOf, paged } from '../../../ai-tools/paging';
import { deviceScopeOfActor } from './person-reach';
import { matches, type ToolContext } from './registry';
import { inRooms, placedDevices } from './targets';

export const AUTOMATION_FILTER = z.strictObject({
  automationId: z.uuid().optional().describe('Only this automation'),
  search: z.string().min(1).max(100).optional().describe('Words in the automation’s name'),
  rooms: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe('Room ids or names of the devices it watches or changes'),
  enabled: z.boolean().optional().describe('Only those switched on (true) or off (false)'),
  limit: z.number().int().min(1).max(200).default(100),
  offset: OFFSET,
});

type AutomationFilter = z.infer<typeof AUTOMATION_FILTER>;

function stringsIn(value: unknown, into: Set<string>): Set<string> {
  if (typeof value === 'string') {
    into.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) stringsIn(entry, into);
  } else if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) stringsIn(entry, into);
  }
  return into;
}

function roomsOf(
  automation: AutomationRowV3,
  roomOfDevice: ReadonlyMap<string, RoomRow>,
): RoomRow[] {
  const rooms = new Map<string, RoomRow>();
  for (const text of stringsIn(automation.definition, new Set())) {
    const room = roomOfDevice.get(text);
    if (room !== undefined) rooms.set(room.id, room);
  }
  return [...rooms.values()];
}

function wanted(filter: AutomationFilter, automation: AutomationRowV3, rooms: RoomRow[]): boolean {
  return (
    (filter.automationId === undefined || automation.id === filter.automationId) &&
    (filter.search === undefined || matches(filter.search, automation.name)) &&
    (filter.enabled === undefined || automation.enabled === filter.enabled) &&
    (filter.rooms === undefined || rooms.some((room) => inRooms(room, filter.rooms ?? [])))
  );
}

export function listAutomations(
  context: Pick<ToolContext, 'store' | 'actor'>,
  filter: AutomationFilter,
): Record<string, unknown> {
  const roomOfDevice = new Map<string, RoomRow>();
  for (const placed of placedDevices(context.store, deviceScopeOfActor(context))) {
    if (placed.room !== null) roomOfDevice.set(placed.device.id, placed.room);
  }
  const listed = context.store.automations
    .list()
    .map((automation) => ({ automation, rooms: roomsOf(automation, roomOfDevice) }))
    .filter(({ automation, rooms }) => wanted(filter, automation, rooms))
    .map(({ automation, rooms }) => ({ ...automation, rooms: rooms.map((room) => room.name) }));
  const { rows, more } = paged(listed, filter.offset, filter.limit);
  return { automations: rows, ...moreOf(more) };
}
