import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { SCRATCH } from './paths.ts';

const HOME_VARIABLES = ['HOME', 'XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR'] as const;

function inside(folder: string, path: string): boolean {
  const from = relative(resolve(folder), resolve(path));
  return from !== '' && !from.startsWith('..') && !isAbsolute(from);
}

export function isolatedHomeEnvironment(
  scratch: string = SCRATCH,
): Readonly<Record<(typeof HOME_VARIABLES)[number], string>> {
  const home = join(scratch, 'home');
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
  };
}

export function assertIsolatedHome(
  environment: Readonly<Record<string, string>>,
  scratch: string = SCRATCH,
  realHome: string = homedir(),
): void {
  for (const name of HOME_VARIABLES) {
    const value = environment[name];
    if (value === undefined || !isAbsolute(value))
      throw new Error(
        `${name} must be an absolute path inside ${scratch} before the rig starts a service.`,
      );
    if (!inside(scratch, value) || resolve(value) === resolve(realHome))
      throw new Error(`${name}=${value} would let the rig touch the real home ${realHome}.`);
  }
}

export function isolatedServiceEnvironment(scratch: string = SCRATCH): Record<string, string> {
  const environment = isolatedHomeEnvironment(scratch);
  assertIsolatedHome(environment, scratch);
  for (const value of Object.values(environment))
    mkdirSync(value, { recursive: true, mode: 0o700 });
  return { ...environment };
}
