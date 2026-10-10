import { z } from 'zod';
import { JSON_VALUE } from './values';

export const PLUGIN_ID = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,31}$/, 'a lower-case plugin id (letters, digits, dashes)');

export type PluginId = z.infer<typeof PLUGIN_ID>;

export const PLUGIN_KEY = z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/, 'a lower-case key');

export const PLUGIN_TITLE = z.string().trim().min(1).max(80);

export const PLUGIN_TOOL = z.string().min(1).max(120);

export const PLUGIN_JSON_OBJECT = z.record(z.string(), JSON_VALUE);
