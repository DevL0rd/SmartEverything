import { z } from 'zod';
import { ID, MOMENT } from './api/primitives';
import { VACUUM_ROOM, VACUUM_SCENE } from './vacuum-scene';

export const VACUUM_HOME_ROOM = z.object({ id: ID, name: z.string() });

export type VacuumHomeRoom = z.infer<typeof VACUUM_HOME_ROOM>;

export const VACUUM_SCENE_ROOM = VACUUM_ROOM.extend({
  homeRoom: VACUUM_HOME_ROOM.nullable().optional(),
});

export const VACUUM_SCENE_ANSWER = VACUUM_SCENE.extend({
  rooms: z.array(VACUUM_SCENE_ROOM),
  unlinkedRooms: z.number().int().nonnegative().optional(),
});

export type VacuumSceneAnswer = z.infer<typeof VACUUM_SCENE_ANSWER>;

export const VACUUM_MAP_ROOM_LINK = z.object({
  mapRoomId: z.number().int(),
  mapRoomName: z.string(),
  colour: z.number().int(),
  areaM2: z.number().nonnegative(),
  homeRoom: VACUUM_HOME_ROOM.nullable(),
  suggestion: VACUUM_HOME_ROOM.nullable(),
});

export type VacuumMapRoomLink = z.infer<typeof VACUUM_MAP_ROOM_LINK>;

export const VACUUM_STALE_ROOM_LINK = z.object({
  mapRoomId: z.number().int(),
  mapRoomName: z.string(),
  homeRoom: VACUUM_HOME_ROOM,
  missingSince: MOMENT,
});

export type VacuumStaleRoomLink = z.infer<typeof VACUUM_STALE_ROOM_LINK>;

export const VACUUM_HOME_ROOM_USE = VACUUM_HOME_ROOM.extend({
  usedBy: z
    .object({ mapRoomId: z.number().int(), mapRoomName: z.string(), stale: z.boolean() })
    .nullable(),
});

export type VacuumHomeRoomUse = z.infer<typeof VACUUM_HOME_ROOM_USE>;

export const VACUUM_ROOM_LINKS = z.object({
  mapIndex: z.number().int(),
  rooms: z.array(VACUUM_MAP_ROOM_LINK),
  stale: z.array(VACUUM_STALE_ROOM_LINK),
  homeRooms: z.array(VACUUM_HOME_ROOM_USE),
  unlinked: z.number().int().nonnegative(),
});

export type VacuumRoomLinks = z.infer<typeof VACUUM_ROOM_LINKS>;

export const VACUUM_ROOM_LINK_SET = z.strictObject({
  roomId: ID,
  move: z.boolean().default(false),
});

export const VACUUM_ROOM_LINKS_SUMMARY = z.object({
  linked: z.number().int().nonnegative(),
  unlinked: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative().optional(),
});

export type VacuumRoomLinksSummary = z.infer<typeof VACUUM_ROOM_LINKS_SUMMARY>;
