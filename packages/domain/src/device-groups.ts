import { z } from 'zod';
import { ID, MOMENT, boundedText } from './api/primitives';

export const DEVICE_GROUP_NAME = boundedText(80);
export const DEVICE_GROUP_MEMBERS = z
  .array(ID)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, 'Each device appears only once');
export const DEVICE_GROUP_INPUT = z.strictObject({
  name: DEVICE_GROUP_NAME,
  device_ids: DEVICE_GROUP_MEMBERS,
});
export const DEVICE_GROUP_ROW = DEVICE_GROUP_INPUT.extend({
  id: ID,
  created_at: MOMENT,
  updated_at: MOMENT,
});
export type DeviceGroupInput = z.infer<typeof DEVICE_GROUP_INPUT>;
export type DeviceGroupRow = z.infer<typeof DEVICE_GROUP_ROW>;
