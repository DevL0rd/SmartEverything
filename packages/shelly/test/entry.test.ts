import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../src');
const IMPORT = /(?:from|import)\s+['"]([^'"]+)['"]/g;

function reachable(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [resolve(SRC, entry)];
  for (const file of queue) {
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(`${file}.ts`, 'utf8');
    const targets = [...source.matchAll(IMPORT)].map((match) => match[1] ?? '');
    for (const target of targets.filter((name) => name.startsWith('.'))) {
      queue.push(resolve(dirname(file), target));
    }
  }
  return [...seen];
}

describe('package entries', () => {
  it('keeps node modules out of everything the app can import', () => {
    for (const file of reachable('index')) {
      expect(readFileSync(`${file}.ts`, 'utf8'), file).not.toMatch(/from\s+['"]node:/);
    }
  });

  it('keeps the connection code on the hub-only entry', () => {
    const shared = reachable('index').map((file) => file.slice(SRC.length + 1));
    expect(shared).not.toContain('rpc');
    expect(shared).not.toContain('digest');
  });
});
