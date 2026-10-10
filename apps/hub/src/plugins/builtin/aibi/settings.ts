import { ROBOT_MODES } from '@smarteverything/domain';
import { z } from 'zod';
import { ANIMATIONS, USABLE_ACTIONS } from './catalogue';

export const SCOPES = ['aibi.read', 'aibi.speak', 'aibi.act', 'memory.write'] as const;

export type Scope = (typeof SCOPES)[number];

export const DEFAULT_PERSONALITY =
  'You are warm, curious, playful and concise. You feel like a small embodied desktop companion, not a generic assistant.';

const DNS_UPSTREAM_PATTERN = '(\\d{1,3}\\.){3}\\d{1,3}(:\\d{1,5})?';

const PORT = z.int().min(1).max(65_535);

export const AIBI_SETTINGS = z.object({
  owner_name: z.string().trim().max(60).default(''),
  scopes: z.array(z.enum(SCOPES)).default(() => [...SCOPES]),
  mode: z.enum(ROBOT_MODES).default('local'),
  personality: z.string().max(2000).default(DEFAULT_PERSONALITY),
  actions: z
    .array(z.string().min(1).max(80))
    .max(200)
    .default(() => [...USABLE_ACTIONS]),
  animations: z
    .array(z.string().min(1).max(120))
    .max(600)
    .default(() => [...ANIMATIONS]),
  lan_address: z.union([z.literal(''), z.ipv4()]).default(''),
  dns: z.boolean().default(true),
  dns_upstream: z
    .string()
    .regex(new RegExp(`^${DNS_UPSTREAM_PATTERN}$`, 'u'))
    .default('1.1.1.1'),
  capture: z.boolean().default(false),
  http_port: PORT.default(80),
  https_port: PORT.default(443),
  dns_port: PORT.default(53),
  idle_seconds: z.int().min(10).max(600).default(30),
  speech_threshold: z.int().min(100).max(8000).default(4000),
  memory_lines: z.int().min(0).max(200).default(40),
});

export type AibiSettings = z.output<typeof AIBI_SETTINGS>;
