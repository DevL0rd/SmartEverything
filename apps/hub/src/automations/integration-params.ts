import {
  AI_SHAPE,
  AUDIO_ACTIONS,
  AUDIO_KINDS,
  DISPLAY_SIDES,
  DISPLAY_TOOL_ACTIONS,
  DISPLAY_VRR_POLICIES,
  JSON_VALUE,
  NIGHT_LIGHT_MODES,
  PHONE_ACTION,
} from '@smarteverything/domain';
import { z } from 'zod';
import { VISION_SOURCES } from './effects/vision-sight';

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

export const VISION_PARAMS = z.object({
  question: z.string(),
  image: z.string().min(1).optional(),
  camera: reference('camera').optional(),
  source: z.enum(VISION_SOURCES).optional(),
  computer: reference('computer').optional(),
  window: z.string().min(1).optional(),
  phone: reference('phone').optional(),
  shape: AI_SHAPE.optional(),
  ...AI_COMMON,
});

export const DECIDE_PARAMS = z.object({
  question: z.string(),
  context: z.string().optional(),
  ...AI_COMMON,
});

const COMPUTER = reference('computer');

const NAME = z.string().min(1).optional();

export const AUDIO_PARAMS = z.object({
  computer: COMPUTER,
  action: z.enum(AUDIO_ACTIONS),
  kind: z.enum(AUDIO_KINDS).optional(),
  device: NAME,
  level: z.number().optional(),
  muted: z.boolean().optional(),
  app: NAME,
  output: NAME,
});

export const DISPLAY_PARAMS = z.object({
  computer: COMPUTER,
  action: z.enum(DISPLAY_TOOL_ACTIONS),
  output: NAME,
  width: z.number().optional(),
  height: z.number().optional(),
  refreshHz: z.number().optional(),
  scale: z.number().optional(),
  rotation: z.string().transform(Number).optional(),
  relativeTo: NAME,
  side: z.enum(DISPLAY_SIDES).optional(),
  mirrorOf: NAME,
  brightness: z.number().optional(),
  enabled: z.boolean().optional(),
  vrr: z.enum(DISPLAY_VRR_POLICIES).optional(),
  nightLight: z.enum(NIGHT_LIGHT_MODES).optional(),
  temperature: z.number().optional(),
  keep: z.boolean().default(false),
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
