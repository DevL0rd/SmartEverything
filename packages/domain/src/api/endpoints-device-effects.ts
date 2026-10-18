import { z } from 'zod';
import { DEVICE_EFFECT_TARGET } from '../device-effects';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING, DONE } from './primitives';

export const DEVICE_EFFECT_ENDPOINTS = {
  listDeviceEffects: endpoint({
    method: 'GET',
    path: '/api/device-effects',
    access: 'member',
    summary:
      'Current bases, temporary contributions and resolved values of controls under a temporary change',
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
