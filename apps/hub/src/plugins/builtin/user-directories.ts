import { homedir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { z } from 'zod';

const OPTIONAL = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

const USER_DIRECTORIES = z.object({ XDG_CONFIG_HOME: OPTIONAL, XDG_STATE_HOME: OPTIONAL });

export function userConfigHome(): string {
  return USER_DIRECTORIES.parse(env).XDG_CONFIG_HOME ?? join(homedir(), '.config');
}

export function userStateHome(): string {
  return USER_DIRECTORIES.parse(env).XDG_STATE_HOME ?? join(homedir(), '.local', 'state');
}

export function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}
