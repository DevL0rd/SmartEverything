import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('tool.service-runtime');

const MANIFEST = z.object({
  name: z.string(),
  version: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  peerDependenciesMeta: z
    .record(z.string(), z.object({ optional: z.boolean().optional() }))
    .optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  os: z.array(z.string()).optional(),
  cpu: z.array(z.string()).optional(),
});
type Manifest = z.infer<typeof MANIFEST>;

interface Requirement {
  readonly name: string;
  readonly optional: boolean;
}

export interface RuntimeCopyOptions {
  readonly installedFrom: string;
  readonly modules: string;
  readonly roots: readonly string[];
  readonly everyTargetRoots: readonly string[];
  readonly omit?: (name: string) => boolean;
  readonly omitPath?: (path: string) => boolean;
  readonly platform: string;
  readonly arch: string;
}

interface Walk {
  readonly options: RuntimeCopyOptions;
  readonly copied: Map<string, string>;
  readonly parent: string;
  readonly lineage: ReadonlyMap<string, string>;
  readonly requirement: Requirement;
  readonly neededBy: string;
  readonly everyTarget: boolean;
}

export class ServiceRuntimeError extends Error {
  override readonly name = 'ServiceRuntimeError';
}

export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

export function matchesPattern(specifier: string, pattern: string): boolean {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${source}$`, 'u').test(specifier);
}

const PREBUILD_FOLDER = /(?:^|\/)prebuilds\/([a-z0-9]+)-([a-z0-9]+)(?:\/|$)/u;

export function otherTargetPrebuild(path: string, platform: string, arch: string): boolean {
  const match = PREBUILD_FOLDER.exec(path);
  return match !== null && (match[1] !== platform || match[2] !== arch);
}

export function acceptsTarget(values: readonly string[] | undefined, actual: string): boolean {
  if (values === undefined) return true;
  if (values.includes(`!${actual}`)) return false;
  return values.every((value) => value.startsWith('!')) || values.includes(actual);
}

function findInstalled(name: string, from: string): string | undefined {
  for (let directory = from; ; directory = dirname(directory)) {
    const manifest = join(directory, 'node_modules', name, 'package.json');
    if (existsSync(manifest)) return dirname(manifest);
    if (directory === dirname(directory)) return undefined;
  }
}

function requirementsOf(manifest: Manifest): readonly Requirement[] {
  const optional = (name: string): Requirement => ({ name, optional: true });
  return [
    ...Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, optional: false })),
    ...Object.keys(manifest.peerDependencies ?? {})
      .filter((name) => manifest.peerDependenciesMeta?.[name]?.optional !== true)
      .map(optional),
    ...Object.keys(manifest.optionalDependencies ?? {}).map(optional),
  ];
}

function fitsTarget(manifest: Manifest, walk: Walk): boolean {
  return (
    walk.everyTarget ||
    (acceptsTarget(manifest.os, walk.options.platform) &&
      acceptsTarget(manifest.cpu, walk.options.arch))
  );
}

function place(directory: string, manifest: Manifest, walk: Walk): string | undefined {
  const { name } = walk.requirement;
  if (walk.lineage.get(name) === manifest.version) return undefined;
  if (walk.copied.get(name) === manifest.version) return undefined;
  const nested = walk.copied.has(name);
  const destination = join(nested ? join(walk.parent, 'node_modules') : walk.options.modules, name);
  if (!nested) walk.copied.set(name, manifest.version);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(directory, destination, {
    recursive: true,
    dereference: true,
    filter: (path) =>
      path !== join(directory, 'node_modules') &&
      walk.options.omitPath?.(relative(directory, path).split(sep).join('/')) !== true,
  });
  return destination;
}

interface Placed {
  readonly walk: Walk;
  readonly directory: string;
  readonly name: string;
  readonly manifest: Manifest;
  readonly destination: string;
}

function placePackage(walk: Walk, from: string): Placed | undefined {
  const { name, optional } = walk.requirement;
  if (walk.options.omit?.(name) === true) {
    log.trace('package.omitted', { name, neededBy: walk.neededBy });
    return undefined;
  }
  const directory = findInstalled(name, from);
  if (directory === undefined) {
    if (optional) {
      log.trace('package.optional_missing', { name, neededBy: walk.neededBy });
      return undefined;
    }
    log.error('package.missing', undefined, { name, neededBy: walk.neededBy });
    throw new ServiceRuntimeError(
      `Runtime package ${name} (needed by ${walk.neededBy}) is not installed.`,
    );
  }
  const manifest = MANIFEST.parse(
    JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')),
  );
  if (!fitsTarget(manifest, walk)) {
    log.trace('package.wrong_target', {
      name,
      platform: walk.options.platform,
      arch: walk.options.arch,
    });
    return undefined;
  }
  const destination = place(directory, manifest, walk);
  return destination === undefined ? undefined : { walk, directory, name, manifest, destination };
}

function copyDependencies(placed: Placed): void {
  const { walk, directory, name, manifest, destination } = placed;
  const lineage = new Map(walk.lineage).set(name, manifest.version);
  for (const requirement of requirementsOf(manifest)) {
    const next = { ...walk, parent: destination, lineage, requirement, neededBy: name };
    const dependency = placePackage(next, directory);
    if (dependency !== undefined) copyDependencies(dependency);
  }
}

export function copyRuntimePackages(options: RuntimeCopyOptions): number {
  rmSync(options.modules, { recursive: true, force: true });
  const copied = new Map<string, string>();
  const roots = options.roots.flatMap((name) => {
    const walk = {
      options,
      copied,
      parent: options.modules,
      lineage: new Map<string, string>(),
      requirement: { name, optional: false },
      neededBy: 'the service bundles',
      everyTarget: options.everyTargetRoots.includes(name),
    };
    return placePackage(walk, options.installedFrom) ?? [];
  });
  roots.forEach(copyDependencies);
  log.debug('packages.copied', {
    requested: options.roots.length,
    placedRoots: roots.length,
    unique: copied.size,
  });
  return copied.size;
}
