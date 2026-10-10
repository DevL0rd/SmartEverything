import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';

const OPTIONAL = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

const ASSISTANT_ENVIRONMENT = z.object({
  PATH: OPTIONAL,
  CLAUDE_CONFIG_DIR: OPTIONAL,
  CODEX_HOME: OPTIONAL,
  DISCORDINATOR_APP_HOME: OPTIONAL,
  LOCALAPPDATA: OPTIONAL,
  XDG_DATA_HOME: OPTIONAL,
  SMARTEVERYTHING_DATA: OPTIONAL,
});

export type AssistantEnvironment = z.output<typeof ASSISTANT_ENVIRONMENT>;

export function assistantEnvironment(): AssistantEnvironment {
  return ASSISTANT_ENVIRONMENT.parse(env);
}

export function processEnvironment(): NodeJS.ProcessEnv {
  return { ...env };
}

export function claudeConfigDirectory(): string {
  return assistantEnvironment().CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
}

export function codexHome(): string {
  return assistantEnvironment().CODEX_HOME ?? join(homedir(), '.codex');
}
