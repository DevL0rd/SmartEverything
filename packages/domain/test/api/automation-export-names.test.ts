import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as domain from '../../src';

const SRC = join(__dirname, '..', '..', 'src');
const API = join(SRC, 'api');

const RUNTIME = /^export\s+(?:declare\s+)?(?:const|function|class|enum)\s+([A-Za-z0-9_$]+)/gm;
const TYPES = /^export\s+(?:type|interface)\s+([A-Za-z0-9_$]+)/gm;
const STAR = /^export\s+\*\s+from\s+'(\.[^']+)'/gm;

function fileOf(base: string): string | null {
  const candidates = [`${base}.ts`, join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function runtimeNamesOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(RUNTIME)].map((match) => match[1] ?? '');
}

function namesOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(RUNTIME), ...source.matchAll(TYPES)].map((match) => match[1] ?? '');
}

function reexported(file: string, seen: Set<string>): string[] {
  if (seen.has(file)) {
    return [];
  }
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  const children = [...source.matchAll(STAR)]
    .map((match) => fileOf(resolve(dirname(file), match[1] ?? '')))
    .filter((child): child is string => child !== null);
  return [...namesOf(file), ...children.flatMap((child) => reexported(child, seen))];
}

const stagedFiles = [
  ...readdirSync(API)
    .filter((file) => /^endpoints-automation-.+\.ts$/.test(file))
    .map((file) => join(API, file)),
  ...[join(API, 'live-automation-trace.ts')].filter((file) => existsSync(file)),
];

const stagedSet = new Set(stagedFiles);

const others = new Set(
  reexported(join(SRC, 'index.ts'), new Set(stagedSet)).filter((name) => name !== ''),
);

describe('staged automation endpoint export names', () => {
  it('finds the secrets endpoint file', () => {
    expect(stagedFiles.map((file) => file.slice(API.length + 1))).toContain(
      'endpoints-automation-secrets.ts',
    );
  });

  for (const file of stagedFiles) {
    const label = file.slice(API.length + 1);
    const names = namesOf(file);

    it(`${label} exports names`, () => {
      expect(names.length).toBeGreaterThan(0);
    });

    it(`${label} runtime exports are reachable from the domain index`, () => {
      expect(runtimeNamesOf(file).filter((name) => !(name in domain))).toStrictEqual([]);
    });

    it(`${label} collides with no other domain export`, () => {
      expect(names.filter((name) => others.has(name))).toStrictEqual([]);
    });
  }
});
