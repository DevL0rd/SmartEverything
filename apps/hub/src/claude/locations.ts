import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';
import { userConfigHome } from '../plugins/builtin/user-directories';

const CLAUDE_ENVIRONMENT = z.object({
  CLAUDE_CONFIG_DIR: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value)),
});

export interface ClaudeLocations {
  readonly sessions: string;
  readonly projects: string;
  readonly desktop: string;
  readonly desktopIndex: string;
}

export function claudeLocations(): ClaudeLocations {
  const claudeHome = CLAUDE_ENVIRONMENT.parse(env).CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const desktop = join(userConfigHome(), 'Claude');
  return {
    sessions: join(claudeHome, 'sessions'),
    projects: join(claudeHome, 'projects'),
    desktop,
    desktopIndex: join(desktop, 'claude-code-sessions'),
  };
}
