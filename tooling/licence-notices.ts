import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { REPOSITORY_ROOT, type ProductionPackage } from './licence-policy.ts';

const MANIFEST = z.object({ name: z.string().optional(), version: z.string().optional() });
const NOTICE_FILE = /^(?:licen[cs]e|copying|notice)(?:[.\-_].*)?$/iu;
const MODULES = 'node_modules';
const MAXIMUM_DEPTH = 4;

export interface Notice {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
  readonly text: string | null;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function namesIn(modules: string): readonly string[] {
  if (!isDirectory(modules)) return [];
  return readdirSync(modules, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    if (!entry.name.startsWith('@')) return [entry.name];
    return readdirSync(join(modules, entry.name)).map((inner) => `${entry.name}/${inner}`);
  });
}

function versionOf(directory: string): string | null {
  const manifest = join(directory, 'package.json');
  if (!existsSync(manifest)) return null;
  return MANIFEST.parse(JSON.parse(readFileSync(manifest, 'utf8'))).version ?? null;
}

function scan(modules: string, depth: number, found: Map<string, string>): void {
  for (const name of namesIn(modules)) {
    const directory = join(modules, name);
    const version = versionOf(directory);
    if (version !== null && !found.has(`${name}@${version}`))
      found.set(`${name}@${version}`, directory);
    if (depth < MAXIMUM_DEPTH) scan(join(directory, MODULES), depth + 1, found);
  }
}

export function installedPackages(): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  scan(join(REPOSITORY_ROOT, MODULES), 0, found);
  for (const group of ['apps', 'packages', 'tooling']) {
    for (const member of namesIn(join(REPOSITORY_ROOT, group))) {
      scan(join(REPOSITORY_ROOT, group, member, MODULES), 0, found);
    }
  }
  return found;
}

export function noticeTextOf(directory: string): string | null {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && NOTICE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) return null;
  return files
    .map((file) => `${file}\n\n${readFileSync(join(directory, file), 'utf8').trim()}`)
    .join('\n\n');
}

export function noticesOf(
  packages: readonly ProductionPackage[],
  installed: ReadonlyMap<string, string>,
): readonly Notice[] {
  return packages.map((one) => {
    const directory = installed.get(`${one.name}@${one.version}`);
    return { ...one, text: directory === undefined ? null : noticeTextOf(directory) };
  });
}

export function noticeFile(notices: readonly Notice[]): string {
  const rule = '='.repeat(78);
  return notices
    .map(
      (one) =>
        `${rule}\n${one.name} ${one.version}\nLicence: ${one.licence}\n${rule}\n\n${one.text ?? `No licence text is bundled for this component; it is licensed under ${one.licence}.`}\n`,
    )
    .join('\n');
}
