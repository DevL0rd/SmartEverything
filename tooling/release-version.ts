import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('tool.release-version');

const ROOT = join(import.meta.dirname, '..');

export const HUB_SERVICE_VERSION_FILE = 'version.json';

const RELEASE_TARGET = z.enum(['app', 'desktop', 'hub']);
type ReleaseTarget = z.infer<typeof RELEASE_TARGET>;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const VERSION = z.string().regex(SEMVER);
const MANIFEST = z.looseObject({ version: VERSION });
const ANY_MANIFEST = z.record(z.string(), z.unknown());

function manifestPath(target: ReleaseTarget, root: string): string {
  return join(root, 'apps', target, 'package.json');
}

export function readVersionManifest(path: string): string {
  return MANIFEST.parse(JSON.parse(readFileSync(path, 'utf8'))).version;
}

export function readReleaseVersion(target: ReleaseTarget, root: string = ROOT): string {
  return readVersionManifest(manifestPath(target, root));
}

export function withVersion(manifest: string, version: string): string {
  MANIFEST.parse(JSON.parse(manifest));
  const kept = ANY_MANIFEST.parse(JSON.parse(manifest));
  return `${JSON.stringify({ ...kept, version: VERSION.parse(version) }, null, 2)}\n`;
}

function setVersion(target: ReleaseTarget, version: string): void {
  const path = manifestPath(target, ROOT);
  const text = withVersion(readFileSync(path, 'utf8'), version);
  writeFileSync(`${path}.next`, text);
  renameSync(`${path}.next`, path);
}

function main(): void {
  const { values } = parseArgs({
    options: { target: { type: 'string' }, set: { type: 'string' } },
  });
  const target = RELEASE_TARGET.parse(values.target);
  if (values.set !== undefined) setVersion(target, values.set);
  const version = readReleaseVersion(target);
  log.info('release.version', { target, version });
  process.stdout.write(`${version}\n`);
}

if (import.meta.main) main();
