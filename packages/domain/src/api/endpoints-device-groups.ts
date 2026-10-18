import { z } from 'zod';
import { DEVICE_GROUP_INPUT, DEVICE_GROUP_ROW } from '../device-groups';
import { TARGET_CHANGE } from '../device-group-commands';
import { SKIPPED_MEMBER } from '../target-result';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';
import { COMMAND_ROW } from './rows-home';

const PARAMS = z.strictObject({ groupId: ID });
export const DEVICE_GROUP_ENDPOINTS = {
  listDeviceGroups: endpoint({
    method: 'GET',
    path: '/api/device-groups',
    access: 'member',
    summary: 'Every named device group with its members',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DEVICE_GROUP_ROW),
  }),
  createDeviceGroup: endpoint({
    method: 'POST',
    path: '/api/device-groups',
    access: 'member',
    summary: 'Create a named group of devices',
    params: NOTHING,
    query: NOTHING,
    body: DEVICE_GROUP_INPUT,
    response: DEVICE_GROUP_ROW,
  }),
  updateDeviceGroup: endpoint({
    method: 'PUT',
    path: '/api/device-groups/:groupId',
    access: 'member',
    summary: 'Rename a device group or change its members',
    params: PARAMS,
    query: NOTHING,
    body: DEVICE_GROUP_INPUT,
    response: DEVICE_GROUP_ROW,
  }),
  removeDeviceGroup: endpoint({
    method: 'DELETE',
    path: '/api/device-groups/:groupId',
    access: 'member',
    summary: 'Remove a device group without changing its devices',
    params: PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  sendTargetCommands: endpoint({
    method: 'POST',
    path: '/api/device-targets/commands',
    access: 'member',
    summary:
      'Set a supported control on devices in a room, named group or explicit selection; returns individual commands and skipped members',
    params: NOTHING,
    query: NOTHING,
    body: TARGET_CHANGE,
    response: z.strictObject({ commands: z.array(COMMAND_ROW), skipped: z.array(SKIPPED_MEMBER) }),
  }),
} as const;
