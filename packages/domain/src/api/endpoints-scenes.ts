import { z } from 'zod';
import { SCENE_ACTIONS } from '../scene-actions';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING, POSITION, somethingToChange } from './primitives';
import { COMMAND_ROW } from './rows-home';
import { SCENE_NAME, SCENE_ROW } from './rows-media';

const SCENE_ICON = z.string().min(1).max(40);
const SCENE_PARAMS = z.strictObject({ sceneId: ID });

export const SCENE_ENDPOINTS = {
  listScenes: endpoint({
    method: 'GET',
    path: '/api/scenes',
    access: 'member',
    summary: 'Every scene in order',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(SCENE_ROW),
  }),
  createScene: endpoint({
    method: 'POST',
    path: '/api/scenes',
    access: 'member',
    summary: 'Add a scene',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      name: SCENE_NAME,
      icon: SCENE_ICON.default('sparkles'),
      actions: SCENE_ACTIONS,
      position: POSITION.default(0),
    }),
    response: SCENE_ROW,
  }),
  updateScene: endpoint({
    method: 'PATCH',
    path: '/api/scenes/:sceneId',
    access: 'member',
    summary: 'Change a scene',
    params: SCENE_PARAMS,
    query: NOTHING,
    body: somethingToChange({ name: SCENE_NAME, icon: SCENE_ICON, actions: SCENE_ACTIONS }),
    response: SCENE_ROW,
  }),
  orderScenes: endpoint({
    method: 'PUT',
    path: '/api/scenes/order',
    access: 'member',
    summary: 'Put the scenes in the given order',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ ids: z.array(ID).min(1) }),
    response: z.array(SCENE_ROW),
  }),
  removeScene: endpoint({
    method: 'DELETE',
    path: '/api/scenes/:sceneId',
    access: 'member',
    summary: 'Delete a scene',
    params: SCENE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  runScene: endpoint({
    method: 'POST',
    path: '/api/scenes/:sceneId/run',
    access: 'member',
    summary: 'Send every action of a scene as a command with source scene',
    params: SCENE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(COMMAND_ROW),
  }),
} as const;
