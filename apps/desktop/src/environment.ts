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

const displayEnvironmentSchema = z.object({
  XDG_SESSION_TYPE: z.string().optional(),
  WAYLAND_DISPLAY: z.string().optional(),
  ELECTRON_OZONE_PLATFORM_HINT: z.string().optional(),
});

export interface DisplayEnvironment {
  readonly sessionType: string | undefined;
  readonly waylandDisplay: string | undefined;
  readonly ozoneHint: string | undefined;
}

export function readDisplayEnvironment(): DisplayEnvironment {
  const parsed = displayEnvironmentSchema.parse(env);
  return {
    sessionType: parsed.XDG_SESSION_TYPE,
    waylandDisplay: parsed.WAYLAND_DISPLAY,
    ozoneHint: parsed.ELECTRON_OZONE_PLATFORM_HINT,
  };
}

const agentEnvironmentSchema = z.object({
  XDG_RUNTIME_DIR: z.string().min(1).optional(),
  LOCALAPPDATA: z.string().min(1).optional(),
});

export function readAgentEnvironment(): {
  runtimeDirectory: string | null;
  localAppData: string | null;
} {
  const parsed = agentEnvironmentSchema.parse(env);
  return {
    runtimeDirectory: parsed.XDG_RUNTIME_DIR ?? null,
    localAppData: parsed.LOCALAPPDATA ?? null,
  };
}
