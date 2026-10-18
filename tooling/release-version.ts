import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('tool.release-version');

const ROOT = join(import.meta.dirname, '..');

export const VERSIONED_PACKAGES = ['app', 'desktop', 'hub'] as const;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const VERSION = z.string().regex(SEMVER);
const MANIFEST = z.looseObject({ version: VERSION });
const ANY_MANIFEST = z.record(z.string(), z.unknown());

export class ReleaseVersionError extends Error {
  override readonly name = 'ReleaseVersionError';

  constructor(
    readonly versions: Readonly<Record<string, string>>,
    reason: string,
  ) {
    super(`${reason}: ${JSON.stringify(versions)}`);
  }
}

function manifestPath(name: string): string {
  return join(ROOT, 'apps', name, 'package.json');
}

export function readVersions(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    VERSIONED_PACKAGES.map((name) => [
      name,
      MANIFEST.parse(JSON.parse(readFileSync(manifestPath(name), 'utf8'))).version,
    ]),
  );
}

export function agreedVersion(versions: Readonly<Record<string, string>>): string {
  const distinct = [...new Set(Object.values(versions))];
  const [only] = distinct;
  if (only === undefined || distinct.length !== 1) {
    throw new ReleaseVersionError(versions, 'The app, desktop and hub must share one version');
  }
  return only;
}

export function withVersion(manifest: string, version: string): string {
  MANIFEST.parse(JSON.parse(manifest));
  const kept = ANY_MANIFEST.parse(JSON.parse(manifest));
  return `${JSON.stringify({ ...kept, version: VERSION.parse(version) }, null, 2)}\n`;
}

function setEverywhere(version: string): void {
  const rewritten = VERSIONED_PACKAGES.map((name) => ({
    path: manifestPath(name),
    text: withVersion(readFileSync(manifestPath(name), 'utf8'), version),
  }));
  for (const { path, text } of rewritten) {
    writeFileSync(`${path}.next`, text);
  }
  for (const { path } of rewritten) {
    renameSync(`${path}.next`, path);
  }
}

function main(): void {
  const { values } = parseArgs({ options: { set: { type: 'string' } } });
  if (values.set !== undefined) {
    setEverywhere(values.set);
  }
  const version = agreedVersion(readVersions());
  log.info('release.version', { version, packages: VERSIONED_PACKAGES.length });
  process.stdout.write(`${version}\n`);
}

if (import.meta.main) main();
