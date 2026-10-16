import { z } from 'zod';
import { DEVICE_EFFECT_TARGET, DEVICE_EFFECT_RESOLUTION } from '../device-effects';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING, DONE } from './primitives';

export const DEVICE_EFFECT_ENDPOINTS = {
  listDeviceEffects: endpoint({
    method: 'GET',
    path: '/api/device-effects',
    access: 'member',
    summary: 'Current desired bases, temporary contributions and resolved device controls',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DEVICE_EFFECT_TARGET),
  }),
  listDeviceEffectSupport: endpoint({
    method: 'GET',
    path: '/api/device-effects/support',
    access: 'member',
    summary:
      'Readable writable state controls supporting temporary Set or numeric Add, with unsupported reasons',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(
      z.strictObject({
        deviceId: ID,
        capability: z.string(),
        supported: z.boolean(),
        relative: z.boolean(),
        reason: z.string().nullable(),
      }),
    ),
  }),
  readDeviceEffectCommand: endpoint({
    method: 'GET',
    path: '/api/device-effects/commands/:commandId',
    access: 'member',
    summary:
      'Actual resolved device value and temporary contributions for a command; null for ordinary commands',
    params: z.strictObject({ commandId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DEVICE_EFFECT_RESOLUTION.nullable(),
  }),
  endDeviceEffect: endpoint({
    method: 'POST',
    path: '/api/device-effects/:effectId/end',
    access: 'member',
    summary:
      'End one temporary device contribution and recompute from current base and remaining changes',
    params: z.strictObject({ effectId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
