import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const REPO = resolve(import.meta.dirname, '..', '..');
export const TEST_HUB_ROOT = join(REPO, 'tmp', 'test-hub');
export const SENTINEL = 'test-hub.json';

const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/u;
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const PRODUCTION_VARIABLES = [
  'SMARTEVERYTHING_HUB_HOME',
  'SMARTEVERYTHING_DATA_DIRECTORY',
] as const;

export class ProductionPathError extends Error {
  override readonly name = 'ProductionPathError';
}

export class NonLoopbackError extends Error {
  override readonly name = 'NonLoopbackError';

  constructor(host: string) {
    super(`The test Hub binds only to loopback; ${host} is refused.`);
  }
}

export type GuardEnvironment = Readonly<Record<string, string | undefined>>;

export interface GuardOptions {
  readonly name: string;
  readonly environment: GuardEnvironment;
  readonly home?: string;
  readonly root?: string;
}

export interface ScratchPaths {
  readonly base: string;
  readonly data: string;
  readonly pointer: string;
  readonly home: string;
  readonly logs: string;
  readonly tmp: string;
}

function realOrSelf(path: string): string {
  let probe = resolve(path);
  const tail: string[] = [];
  while (!existsSync(probe)) {
    tail.unshift(probe.slice(dirname(probe).length + 1));
    probe = dirname(probe);
  }
  return join(realpathSync(probe), ...tail);
}

export function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function productionLocations(home: string): readonly string[] {
  const config = join(home, '.config');
  return [
    join(config, 'SmartEverything'),
    join(config, 'SmartEverything-Hub'),
    join(home, '.local', 'opt', 'SmartEverything-Hub'),
    join(home, '.local', 'share', 'SmartEverything'),
    '/srv',
    '/mnt',
    '/media',
  ];
}

function environmentProblem(environment: GuardEnvironment, allowed: string): string | undefined {
  for (const variable of PRODUCTION_VARIABLES) {
    const value = environment[variable];
    if (value === undefined || value === '') continue;
    if (!isAbsolute(value) || !inside(allowed, realOrSelf(value)))
      return `${variable} points outside the test area (${allowed}).`;
  }
  return undefined;
}

function dirtyFolder(folder: string): boolean {
  if (!existsSync(folder)) return false;
  if (existsSync(join(folder, SENTINEL))) return false;
  return readdirSync(folder).length > 0;
}

function assertOutsideProduction(base: string, real: string, home: string): void {
  for (const location of productionLocations(home)) {
    if (inside(location, real) || inside(real, location))
      throw new ProductionPathError(`${base} overlaps the production location ${location}.`);
  }
}

function checkedBase(options: GuardOptions, root: string, home: string): string {
  if (!NAME.test(options.name))
    throw new ProductionPathError(`The name ${options.name} is not a plain test name.`);
  const problem = environmentProblem(options.environment, root);
  if (problem !== undefined) throw new ProductionPathError(problem);
  const base = join(root, options.name);
  const real = realOrSelf(base);
  if (!inside(realOrSelf(root), real) || real === realOrSelf(root))
    throw new ProductionPathError(`${base} is not inside ${root}.`);
  assertOutsideProduction(base, real, home);
  if (dirtyFolder(base))
    throw new ProductionPathError(
      `${base} already holds files that this tool did not create; choose another name.`,
    );
  return base;
}

export function scratchPaths(options: GuardOptions): ScratchPaths {
  const base = checkedBase(options, options.root ?? TEST_HUB_ROOT, options.home ?? homedir());
  return {
    base,
    data: join(base, 'data'),
    pointer: join(base, 'pointer'),
    home: join(base, 'home'),
    logs: join(base, 'logs'),
    tmp: join(base, 'tmp'),
  };
}

export function assertLoopback(host: string): void {
  if (!LOOPBACK.has(host)) throw new NonLoopbackError(host);
}
