import { z } from 'zod';
import { HOME_MAP } from '../home-map';
import { HOME_MAP_ELEMENT_ID, HOME_MAP_NOTICE_ID, HOME_MAP_POINT } from '../home-map-elements';
import {
  HOME_MAP_ACTOR,
  HOME_MAP_EDIT_BATCH,
  HOME_MAP_EDIT_CONFLICT,
  HOME_MAP_REVISION_ENTRY,
} from '../home-map-edit-ops';
import { HOME_MAP_SOURCE_KINDS } from '../home-map-source';
import { HOME_MAP_MAP_ID } from '../home-map-set';
import { NO_BODY, endpoint } from './endpoint';
import { ID, MOMENT, NOTHING } from './primitives';

export const HOME_MAP_VIEWS = ['full', 'compact'] as const;

export const HOME_MAP_NOTICE_ACTIONS = [
  'use_source',
  'keep_mine',
  'split_like_source',
  'delete',
] as const;

export const HOME_MAP_IMPORT_STATUSES = ['imported', 'unchanged', 'pending'] as const;

export const HOME_MAP_SUMMARY_ROW = z.object({
  id: z.string().min(1),
  revision: z.int().nonnegative(),
  name: z.string(),
  floors: z.int().nonnegative(),
  position: z.int().nonnegative().optional(),
  isDefault: z.boolean().optional(),
  fedBy: z.array(z.string()).optional(),
  hasScan: z.boolean().optional(),
  updatedAt: MOMENT,
});

export type HomeMapSummaryRow = z.infer<typeof HOME_MAP_SUMMARY_ROW>;

const COMPACT_BOUNDS = z.looseObject({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});

const COMPACT_ROOM = z.looseObject({
  id: HOME_MAP_ELEMENT_ID,
  name: z.string().nullable(),
  homeRoomId: ID.nullable(),
  areaSquareMetres: z.number().nonnegative(),
  bounds: COMPACT_BOUNDS,
});

const COMPACT_OBJECT = z.looseObject({
  id: HOME_MAP_ELEMENT_ID,
  name: z.string(),
  modelId: z.string().min(1),
  roomId: HOME_MAP_ELEMENT_ID.nullable(),
});

const COMPACT_DEVICE = z.looseObject({
  deviceId: ID,
  roomId: HOME_MAP_ELEMENT_ID.nullable(),
  position: z.string(),
});

const COMPACT_FLOOR = z.looseObject({
  id: HOME_MAP_ELEMENT_ID,
  name: z.string(),
  level: z.int(),
  rooms: z.array(COMPACT_ROOM),
  objects: z.array(COMPACT_OBJECT),
  devices: z.array(COMPACT_DEVICE),
});

export const HOME_MAP_COMPACT = z.looseObject({
  view: z.literal('compact'),
  revision: z.int().nonnegative(),
  name: z.string(),
  floors: z.array(COMPACT_FLOOR),
});

export type HomeMapCompact = z.infer<typeof HOME_MAP_COMPACT>;

export const HOME_MAP_ANSWER = z.union([HOME_MAP_COMPACT, HOME_MAP]);

export const HOME_MAP_REVISION_ANSWER = z.strictObject({ revision: z.int().nonnegative() });

export const HOME_MAP_EDIT_RESULT = z.strictObject({
  revision: z.int().nonnegative(),
  conflicts: z.array(HOME_MAP_EDIT_CONFLICT),
});

export type HomeMapEditResultAnswer = z.infer<typeof HOME_MAP_EDIT_RESULT>;

export const HOME_MAP_IMPORT_RESULT = z.strictObject({
  revision: z.int().nonnegative(),
  status: z.enum(HOME_MAP_IMPORT_STATUSES),
});

export const HOME_MAP_PLACE_RESULT = z.strictObject({
  revision: z.int().nonnegative(),
  placed: z.int().nonnegative(),
});

const SOURCE_PARAMS = z.strictObject({ sourceId: HOME_MAP_ELEMENT_ID });

const NOTICE_PARAMS = z.strictObject({ noticeId: HOME_MAP_NOTICE_ID });

const MAP_QUERY = z.strictObject({ mapId: HOME_MAP_MAP_ID.optional() });

const VIEW_QUERY = MAP_QUERY.extend({ view: z.enum(HOME_MAP_VIEWS).default('full') });

const REVISIONS_QUERY = MAP_QUERY.extend({
  actor: HOME_MAP_ACTOR.optional(),
  after: z.coerce.number().int().nonnegative().optional(),
});

const IMPORT_BODY = z.strictObject({
  kind: z.enum(HOME_MAP_SOURCE_KINDS),
  deviceId: ID,
  floorId: HOME_MAP_ELEMENT_ID.optional(),
});

const SOURCE_TRANSFORM = z.strictObject({
  rotationDeg: z.number(),
  tx: z.number(),
  ty: z.number(),
  mirrored: z.boolean(),
});

const ALIGN_PAIR = z.strictObject({ source: HOME_MAP_POINT, house: HOME_MAP_POINT });

const ALIGN_BODY = z.union([
  z.strictObject({ transform: SOURCE_TRANSFORM }),
  z.strictObject({ points: z.tuple([ALIGN_PAIR, ALIGN_PAIR]) }),
]);

const NOTICE_BODY = z.strictObject({ action: z.enum(HOME_MAP_NOTICE_ACTIONS) });

const PLACE_BODY = z.strictObject({
  roomId: ID.optional(),
  deviceIds: z.array(ID).min(1).optional(),
});

export const HOME_MAP_AREA_ENDPOINTS = {
  getHomeMap: endpoint({
    method: 'GET',
    path: '/api/home-map',
    access: 'member',
    summary:
      'Read the house map: floors, rooms, walls, openings, furniture and where each device sits. view=compact answers floors with room names, areas and bounds, furniture by catalogue name and room, and device positions in words, without outlines. The answer carries the revision as its ETag',
    params: NOTHING,
    query: VIEW_QUERY,
    body: NO_BODY,
    response: HOME_MAP_ANSWER,
  }),
  editHomeMap: endpoint({
    method: 'POST',
    path: '/api/home-map/edits',
    access: 'member',
    summary:
      'Change the house map with a batch of add, update, remove and move operations on rooms, walls, openings, furniture, device placements and notes, and on floors, sent with the revision they were made on. Answers the new revision and the operations dropped because their element changed or went away. Each batch is one undoable step',
    params: NOTHING,
    query: MAP_QUERY,
    body: HOME_MAP_EDIT_BATCH,
    response: HOME_MAP_EDIT_RESULT,
  }),
  undoHomeMap: endpoint({
    method: 'POST',
    path: '/api/home-map/undo',
    access: 'member',
    summary:
      'Undo the last map change made by the caller (a person or their AI); changes made by others are never reverted. Answers the new revision and any operations that no longer apply',
    params: NOTHING,
    query: MAP_QUERY,
    body: NO_BODY,
    response: HOME_MAP_EDIT_RESULT,
  }),
  redoHomeMap: endpoint({
    method: 'POST',
    path: '/api/home-map/redo',
    access: 'member',
    summary:
      'Redo the last map change the caller undid, until the caller makes a new change. Answers the new revision and any operations that no longer apply',
    params: NOTHING,
    query: MAP_QUERY,
    body: NO_BODY,
    response: HOME_MAP_EDIT_RESULT,
  }),
  listHomeMapRevisions: endpoint({
    method: 'GET',
    path: '/api/home-map/revisions',
    access: 'member',
    summary:
      'List the map changes in order, each with its operations, the operations that reverse it, who made it and when. Filter by actor (profile, ai or source) and by the revision to start after',
    params: NOTHING,
    query: REVISIONS_QUERY,
    body: NO_BODY,
    response: z.array(HOME_MAP_REVISION_ENTRY),
  }),
  importHomeMapSource: endpoint({
    method: 'POST',
    path: '/api/home-map/sources',
    access: 'member',
    summary:
      'Import the map of a robot vacuum into the house map, on a floor if given. Only a settled map is read: while the robot is mid run the import waits and answers pending. Answers imported, unchanged or pending with the revision',
    params: NOTHING,
    query: MAP_QUERY,
    body: IMPORT_BODY,
    response: HOME_MAP_IMPORT_RESULT,
  }),
  alignHomeMapSource: endpoint({
    method: 'PUT',
    path: '/api/home-map/sources/:sourceId',
    access: 'member',
    summary:
      'Align an imported robot map with the house: give its rotation, shift and mirror, or two points each with its place in the robot map and in the house. Furniture and devices you placed stay where they are',
    params: SOURCE_PARAMS,
    query: MAP_QUERY,
    body: ALIGN_BODY,
    response: HOME_MAP_REVISION_ANSWER,
  }),
  resolveHomeMapNotice: endpoint({
    method: 'POST',
    path: '/api/home-map/notices/:noticeId',
    access: 'member',
    summary:
      'Settle a notice left by a robot map update: use_source takes the robot version, keep_mine keeps the house version, split_like_source splits the room as the robot did, delete removes the element',
    params: NOTICE_PARAMS,
    query: MAP_QUERY,
    body: NOTICE_BODY,
    response: HOME_MAP_REVISION_ANSWER,
  }),
  placeHomeMapDevices: endpoint({
    method: 'POST',
    path: '/api/home-map/placements',
    access: 'member',
    summary:
      'Place devices on the house map inside their rooms, for one room, for the devices given, or for every device that has no place yet. Devices you placed by hand never move. Answers the revision and how many were placed',
    params: NOTHING,
    query: MAP_QUERY,
    body: PLACE_BODY,
    response: HOME_MAP_PLACE_RESULT,
  }),
} as const;
