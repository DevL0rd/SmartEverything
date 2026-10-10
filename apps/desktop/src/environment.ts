import { env } from 'node:process';
import { z } from 'zod';
import { VARIANT_NAME, type DesktopVariantName } from './variant.js';

const xdgEnvironmentSchema = z.object({
  XDG_DATA_HOME: z.string().optional(),
  XDG_DATA_DIRS: z.string().optional(),
  XDG_CONFIG_HOME: z.string().optional(),
});

export type XdgEnvironment = z.infer<typeof xdgEnvironmentSchema>;

export function readXdgEnvironment(): XdgEnvironment {
  return xdgEnvironmentSchema.parse(env);
}

const searchPathSchema = z.object({ PATH: z.string().optional(), Path: z.string().optional() });

export function readSearchPath(): string {
  const parsed = searchPathSchema.parse(env);
  return parsed.PATH ?? parsed.Path ?? '';
}

const buildEnvironmentSchema = z.object({ APP_VARIANT: VARIANT_NAME.default('release') });

export function readBuildVariant(): DesktopVariantName {
  return buildEnvironmentSchema.parse(env).APP_VARIANT;
}
