import { z } from 'zod';
import {
  VACUUM_CLEAN,
  VACUUM_CLEAN_SUMMARY,
  VACUUM_POINT,
  VACUUM_SEGMENT,
  VACUUM_SLOT,
} from '../vacuum-scene';
import { VACUUM_ROOM_LINKS, VACUUM_ROOM_LINK_SET, VACUUM_SCENE_ANSWER } from '../vacuum-room-links';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, queryLimit } from './primitives';
import { SESSION_DESCRIPTION } from './endpoints-media';

const DEVICE = z.strictObject({ deviceId: ID });
const CLEAN = DEVICE.extend({ cleanId: z.string().min(1) });
const ROOM = DEVICE.extend({ mapRoomId: z.coerce.number().int() });

export const VACUUM_RESTRICTED_LIMIT = 10;

const AREA = z.array(VACUUM_POINT).length(4);

const RESTRICTED = z.object({
  noGo: z.array(AREA),
  noMop: z.array(AREA),
  walls: z.array(VACUUM_SEGMENT),
});

export type VacuumRestricted = z.infer<typeof RESTRICTED>;

const RESTRICTED_EDIT = RESTRICTED.partial();

function restrictedCount(areas: z.infer<typeof RESTRICTED_EDIT>): number {
  return (areas.noGo?.length ?? 0) + (areas.noMop?.length ?? 0) + (areas.walls?.length ?? 0);
}

export const VACUUM_AREAS_EDIT = RESTRICTED_EDIT.refine(
  (areas) => restrictedCount(areas) <= VACUUM_RESTRICTED_LIMIT,
  {
    message: `The robot keeps at most ${String(VACUUM_RESTRICTED_LIMIT)} restricted areas and walls in total`,
  },
);

export const VACUUM_AREAS_RESULT = z.object({ previous: RESTRICTED });

export const VACUUM_ROOM_EDIT = z
  .strictObject({
    floor: z.number().int().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((edit) => edit.floor !== undefined || edit.hidden !== undefined, {
    message: 'Give a floor or hidden. A map room takes its name from the home room it is linked to',
  });

export const VACUUM_CLEANS_PAGE = z.object({
  cleans: z.array(VACUUM_CLEAN_SUMMARY),
});

export const VACUUM_VIDEO_OPEN = SESSION_DESCRIPTION.extend({
  password: z
    .string()
    .regex(/^\d{4}$/u, 'the 4 digit video password')
    .optional(),
});

export const VACUUM_VIDEO_OPENING = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('live'), sdp: z.string().min(1) }),
  z.strictObject({ status: z.literal('press_button'), until: MOMENT }),
  z.strictObject({ status: z.literal('password_required') }),
  z.strictObject({ status: z.literal('wrong_password') }),
  z.strictObject({ status: z.literal('firewall_blocked'), address: z.string().min(1) }),
  z.strictObject({ status: z.literal('no_reply') }),
]);

export type VacuumVideoOpening = z.infer<typeof VACUUM_VIDEO_OPENING>;

export const VACUUM_AREA_ENDPOINTS = {
  getVacuumScene: endpoint({
    method: 'GET',
    path: '/api/vacuums/:deviceId/scene',
    access: 'member',
    summary:
      'The map of a robot vacuum as a scene in metres with y up: rooms with names and areas, walls, doors, carpets, furniture, objects, no-go zones, the dock, the robot and its trail. slot is current (the live map), saved or backup. Each room carries the home room it is linked to (homeRoom, null when not linked) and unlinkedRooms counts the rooms not linked yet. The answer carries the map index as its version',
    params: DEVICE,
    query: z.strictObject({ slot: VACUUM_SLOT.default('current') }),
    body: NO_BODY,
    response: VACUUM_SCENE_ANSWER,
  }),
  listVacuumCleans: endpoint({
    method: 'GET',
    path: '/api/vacuums/:deviceId/cleans',
    access: 'member',
    summary:
      'The finished cleans of a robot vacuum, newest first: when, how long, area, scope, mode, rooms and how it ended. Pass before with the start of the last clean to read older ones',
    params: DEVICE,
    query: z.strictObject({ before: MOMENT.optional(), limit: queryLimit(30, 200) }),
    body: NO_BODY,
    response: VACUUM_CLEANS_PAGE,
  }),
  getVacuumClean: endpoint({
    method: 'GET',
    path: '/api/vacuums/:deviceId/cleans/:cleanId',
    access: 'member',
    summary:
      'One clean of a robot vacuum with the path it drove and the index of the map it used, so the path can be drawn on that map',
    params: CLEAN,
    query: NOTHING,
    body: NO_BODY,
    response: VACUUM_CLEAN,
  }),
  editVacuumAreas: endpoint({
    method: 'PUT',
    path: '/api/vacuums/:deviceId/areas',
    access: 'member',
    summary:
      'Replace the no-go areas, no-mop areas and virtual walls of a robot vacuum, in metres in its map frame. A list left out stays as it is. The robot keeps at most 10 in total. The answer holds the previous areas so a change can be undone by sending them back',
    params: DEVICE,
    query: NOTHING,
    body: VACUUM_AREAS_EDIT,
    response: VACUUM_AREAS_RESULT,
  }),
  setVacuumRoomSettings: endpoint({
    method: 'PATCH',
    path: '/api/vacuums/:deviceId/rooms/:mapRoomId',
    access: 'member',
    summary:
      'Set the floor material of a room on the map of a robot vacuum or hide it on the map. A map room has no name of its own to set: it shows the name of the home room it is linked to (setVacuumRoomLink)',
    params: ROOM,
    query: NOTHING,
    body: VACUUM_ROOM_EDIT,
    response: DONE,
  }),
  listVacuumRoomLinks: endpoint({
    method: 'GET',
    path: '/api/vacuums/:deviceId/room-links',
    access: 'member',
    summary:
      'The rooms on the map of a robot vacuum and the home room each is linked to, with a suggested home room by name for the unlinked ones (a suggestion is never linked until it is set), the links whose map room is no longer on the map (stale), every home room with the map room that already uses it, and the count of unlinked map rooms',
    params: DEVICE,
    query: NOTHING,
    body: NO_BODY,
    response: VACUUM_ROOM_LINKS,
  }),
  setVacuumRoomLink: endpoint({
    method: 'PUT',
    path: '/api/vacuums/:deviceId/room-links/:mapRoomId',
    access: 'member',
    summary:
      'Link a room on the map of a robot vacuum to a home room. A home room links to one map room per robot: when another map room already uses it the link is refused unless move is true, which moves the link and leaves the other map room unlinked. Answers the links as listVacuumRoomLinks does',
    params: ROOM,
    query: NOTHING,
    body: VACUUM_ROOM_LINK_SET,
    response: VACUUM_ROOM_LINKS,
  }),
  removeVacuumRoomLink: endpoint({
    method: 'DELETE',
    path: '/api/vacuums/:deviceId/room-links/:mapRoomId',
    access: 'member',
    summary:
      'Unlink a room on the map of a robot vacuum from its home room, also a stale link whose map room is gone. Answers the links as listVacuumRoomLinks does',
    params: ROOM,
    query: NOTHING,
    body: NO_BODY,
    response: VACUUM_ROOM_LINKS,
  }),
  openVacuumVideo: endpoint({
    method: 'POST',
    path: '/api/vacuums/:deviceId/video',
    access: 'member',
    summary:
      'Open the live camera of a robot vacuum for this viewer with the video password the person typed when the robot has one (the password is optional and never set or removed by the hub; a robot without a password streams without it, a password sent to such a robot is ignored). The caller first holds the demand topic video on the robot through its live socket; the hub then switches the robot video on if it was off, checks the password when the robot has one, enters the video page and answers the WebRTC offer, and when the last holder of the video demand lets go (including a closed socket) it leaves the video page and puts the video switch back to the value it had before. The status says live, press the button on the robot (until when), password required (the robot has one and none was sent), wrong password, blocked by this computer firewall or no reply from the robot',
    params: DEVICE,
    query: NOTHING,
    body: VACUUM_VIDEO_OPEN,
    response: VACUUM_VIDEO_OPENING,
  }),
  closeVacuumVideo: endpoint({
    method: 'DELETE',
    path: '/api/vacuums/:deviceId/video',
    access: 'member',
    summary:
      'Close the live camera of a robot vacuum: the robot leaves the video page, its video switch goes back to what it was before and the stream is removed, unless another viewer still holds the video demand',
    params: DEVICE,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
