import { z } from 'zod';
import {
  HOME_MAP_FEED,
  HOME_MAP_FEED_ASSIGNMENT_WRITE,
  HOME_MAP_MAP_ID,
  HOME_MAP_SUMMARY,
  HOME_MAP_VERSION,
  HOME_MAP_VERSION_ID,
} from '../home-map-set';
import { HOME_MAP_ELEMENT_ID } from '../home-map-elements';
import { HOME_MAP_REVISION_ANSWER } from './endpoints-home-map';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

const MAP_PARAMS = z.strictObject({ mapId: HOME_MAP_MAP_ID });

const VERSION_PARAMS = z.strictObject({
  mapId: HOME_MAP_MAP_ID,
  versionId: HOME_MAP_VERSION_ID,
});

const FEED_PARAMS = z.strictObject({
  deviceId: ID,
  robotMapId: z.coerce.number().int().nonnegative(),
});

const CREATE_BODY = z.strictObject({ name: z.string().trim().min(1) });

const UPDATE_BODY = z
  .strictObject({
    name: z.string().trim().min(1).optional(),
    isDefault: z.literal(true).optional(),
    position: z.int().nonnegative().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'give a name, isDefault or a position');

const VERSION_BODY = z.strictObject({ name: z.string().trim().min(1).optional() });

const RESET_BODY = z.strictObject({ sourceId: HOME_MAP_ELEMENT_ID.optional() });

export const HOME_MAP_SET_ENDPOINTS = {
  listHomeMaps: endpoint({
    method: 'GET',
    path: '/api/home-maps',
    access: 'member',
    summary:
      'List the house maps in their order: id, name, revision, floor names, room count, whether it is the default, which robot maps feed it and whether it has a scan',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(HOME_MAP_SUMMARY),
  }),
  createHomeMap: endpoint({
    method: 'POST',
    path: '/api/home-maps',
    access: 'member',
    summary:
      'Create an empty house map with a name, placed last; the first map ever created becomes the default',
    params: NOTHING,
    query: NOTHING,
    body: CREATE_BODY,
    response: HOME_MAP_SUMMARY,
  }),
  updateHomeMap: endpoint({
    method: 'PATCH',
    path: '/api/home-maps/:mapId',
    access: 'member',
    summary:
      'Rename a house map, make it the default (the previous default stops being one) or move it to a position in the list',
    params: MAP_PARAMS,
    query: NOTHING,
    body: UPDATE_BODY,
    response: HOME_MAP_SUMMARY,
  }),
  deleteHomeMap: endpoint({
    method: 'DELETE',
    path: '/api/home-maps/:mapId',
    access: 'member',
    summary:
      'Delete a house map with its placements, robot map feeds, versions and scan; devices stay in their rooms and the first remaining map becomes the default',
    params: MAP_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listHomeMapVersions: endpoint({
    method: 'GET',
    path: '/api/home-maps/:mapId/versions',
    access: 'member',
    summary:
      'List the saved versions of a house map, newest first, with name, time and who saved it',
    params: MAP_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(HOME_MAP_VERSION),
  }),
  saveHomeMapVersion: endpoint({
    method: 'POST',
    path: '/api/home-maps/:mapId/versions',
    access: 'member',
    summary: 'Save the current state of a house map as a named version to come back to later',
    params: MAP_PARAMS,
    query: NOTHING,
    body: VERSION_BODY,
    response: HOME_MAP_VERSION,
  }),
  restoreHomeMapVersion: endpoint({
    method: 'POST',
    path: '/api/home-maps/:mapId/versions/:versionId/restore',
    access: 'member',
    summary:
      'Restore a saved version of a house map as one undoable change; answers the new revision',
    params: VERSION_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: HOME_MAP_REVISION_ANSWER,
  }),
  resetHomeMapToSource: endpoint({
    method: 'POST',
    path: '/api/home-maps/:mapId/reset',
    access: 'member',
    summary:
      'Reset the rooms, walls and openings that came from a robot map to the robot version, for one source or all of them, keeping furniture, devices, materials and names as one undoable change',
    params: MAP_PARAMS,
    query: NOTHING,
    body: RESET_BODY,
    response: HOME_MAP_REVISION_ANSWER,
  }),
  listRobotMapFeeds: endpoint({
    method: 'GET',
    path: '/api/home-map/feeds',
    access: 'member',
    summary:
      'List every map saved in a robot vacuum with the house map and floor it feeds, or no target when it is not used',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(HOME_MAP_FEED),
  }),
  setRobotMapFeed: endpoint({
    method: 'PUT',
    path: '/api/home-map/feeds/:deviceId/:robotMapId',
    access: 'member',
    summary:
      'Choose which house map and floor a robot map feeds, or send target null for not used; nothing is sent to the robot',
    params: FEED_PARAMS,
    query: NOTHING,
    body: HOME_MAP_FEED_ASSIGNMENT_WRITE,
    response: HOME_MAP_FEED,
  }),
} as const;
