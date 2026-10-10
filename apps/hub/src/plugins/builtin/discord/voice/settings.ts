import {
  DEFAULT_PAUSE_MS,
  DEFAULT_WAKE_SENSITIVITY,
  WAKE_SENSITIVITIES,
} from '@smarteverything/domain';
import { z } from 'zod';

export const VOICE_SETTINGS = {
  voice_enabled: z.boolean().default(true),
  voice_auto_join: z.boolean().default(true),
  voice_leave_after_seconds: z.number().int().min(5).max(3600).default(60),
  voice_idle_seconds: z.number().int().min(10).max(600).default(60),
  voice_pause_ms: z.number().int().min(0).max(3000).default(DEFAULT_PAUSE_MS),
  voice_transcribe: z.enum(['everyone', 'approved']).default('everyone'),
  voice_retention_days: z.number().int().min(1).max(365).default(30),
  voice_context_minutes: z.number().int().min(1).max(120).default(10),
  voice_wake_sensitivity: z.enum(WAKE_SENSITIVITIES).default(DEFAULT_WAKE_SENSITIVITY),
  voice_language: z
    .string()
    .regex(/^([a-z]{2})?$/)
    .default(''),
} as const;
