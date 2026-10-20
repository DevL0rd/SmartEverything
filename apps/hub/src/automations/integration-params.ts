import {
  AI_SHAPE,
  JSON_VALUE,
  MEDIA_SIZES,
  PHONE_ACTION,
  POWER_ACTIONS,
} from '@smarteverything/domain';
import { z } from 'zod';

function reference(kind: string): z.ZodType<string> {
  return z.union([
    z.string().min(1),
    z.strictObject({ [kind]: z.string().min(1) }).transform((ref) => String(ref[kind])),
  ]);
}

const PERSON = reference('person');

const AI_COMMON = {
  person: PERSON.optional(),
  model: z.string().min(1).optional(),
  budget: z.number().min(0).optional(),
};

export const ASK_PARAMS = z.object({
  prompt: z.string(),
  images: z.array(z.string().min(1)).optional(),
  system: z.string().optional(),
  shape: AI_SHAPE.optional(),
  tools: z.array(z.string().min(1)).default([]),
  ...AI_COMMON,
});

export const VISION_PARAMS = z
  .object({
    question: z.string(),
    image: z.string().min(1).optional(),
    camera: reference('camera').optional(),
    shape: AI_SHAPE.optional(),
    ...AI_COMMON,
  })
  .refine((params) => (params.image === undefined) !== (params.camera === undefined), {
    message: 'give either a picture or a camera',
  });

export const DECIDE_PARAMS = z.object({
  question: z.string(),
  context: z.string().optional(),
  ...AI_COMMON,
});

export const SNAPSHOT_PARAMS = z.object({
  camera: reference('camera'),
  size: z.enum(MEDIA_SIZES).default('full'),
});

export const POWER_PARAMS = z.object({
  computer: reference('computer'),
  action: z.enum(POWER_ACTIONS),
});

export const PHONE_PARAMS = z.object({ phone: reference('phone'), action: PHONE_ACTION });

export const HEALTH_PARAMS = z.object({
  person: PERSON,
  metric: z.string().min(1),
  withinDays: z.number().int().min(1).max(365).default(1),
});

export const EMIT_PARAMS = z.object({
  name: z.string().min(1).max(120),
  payload: z.record(z.string(), JSON_VALUE).default({}),
});

export const RESPOND_PARAMS = z.object({
  status: z.number().int().min(100).max(599).default(200),
  body: JSON_VALUE.optional(),
  headers: z.record(z.string(), z.string()).default({}),
});

export const HEALTH_ANSWER = z.looseObject({
  daily: z.array(
    z.looseObject({ day: z.string(), metric: z.string(), value: z.number(), unit: z.string() }),
  ),
});

export const COMPUTER_ANSWER = z.unknown();
