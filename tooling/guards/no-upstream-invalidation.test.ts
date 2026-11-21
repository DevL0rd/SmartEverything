import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as keys from '../../apps/app/src/queries/keys.ts';
import { applicationSource, filesUnder, insideApp } from './repository-files';

const UPSTREAM_PROXY_ENDPOINTS = ['readOpenRouterAccount'];

const QUERIES = join(applicationSource, 'queries');

const LIVE_INVALIDATIONS = join(QUERIES, 'live-invalidations.ts');

const NOT_LIVE: Readonly<Record<string, string>> = {
  refreshAllWindows: 'rereads every window once when the app resumes after being away',
};

const QUERY_KEY = /queryKey:\s*([A-Z][A-Z0-9_]*)\b/g;

const sources = filesUnder(applicationSource).filter(
  (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
);

function keyOf(name: string): readonly unknown[] {
  const value: unknown = Reflect.get(keys, name);
  if (!Array.isArray(value)) throw new Error(`${name} is not a query key exported by keys.ts`);
  return value;
}

function upstreamKeys(): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(QUERY_KEY)) {
      const name = match[1];
      if (name === undefined) continue;
      const rest = text.slice(match.index + match[0].length);
      const ends = [rest.search(/queryKey:/), rest.search(/\n\}/)].filter((at) => at !== -1);
      const options = rest.slice(0, Math.min(rest.length, ...ends));
      const start = options.indexOf('queryFn:');
      if (start === -1) continue;
      const queryFn = options.slice(start);
      if (UPSTREAM_PROXY_ENDPOINTS.some((endpoint) => queryFn.includes(`.${endpoint}`))) {
        found.set(name, insideApp(file));
      }
    }
  }
  return found;
}

function covers(prefix: readonly unknown[], key: readonly unknown[]): boolean {
  return prefix.length <= key.length && prefix.every((part, index) => part === key[index]);
}

function invalidatedKeys(text: string): readonly string[] {
  const names: string[] = [];
  for (const call of text.matchAll(/\.(?:invalidateQueries|refetchQueries|resetQueries)\(/g)) {
    const end = text.indexOf(')', call.index);
    const args = text.slice(call.index, end === -1 ? undefined : end);
    for (const match of args.matchAll(QUERY_KEY)) {
      if (match[1] !== undefined) names.push(match[1]);
    }
  }
  return names;
}

function withoutNotLive(text: string): string {
  return Object.keys(NOT_LIVE).reduce((rest, name) => {
    const at = rest.indexOf(`export function ${name}(`);
    if (at === -1) throw new Error(`${name} is no longer in the live invalidations`);
    const end = rest.indexOf('\n}\n', at);
    return rest.slice(0, at) + rest.slice(end === -1 ? rest.length : end + 3);
  }, text);
}

function liveModules(): readonly string[] {
  const text = readFileSync(LIVE_INVALIDATIONS, 'utf8');
  const local = [...text.matchAll(/from '\.\/([^']+)'/g)].flatMap((match) =>
    match[1] === undefined ? [] : [join(QUERIES, `${match[1]}.ts`)],
  );
  return [LIVE_INVALIDATIONS, ...local];
}

describe('live invalidations of upstream proxy reads', () => {
  const upstream = upstreamKeys();

  it('finds every query whose read proxies an upstream service', () => {
    expect([...upstream.keys()]).toContain('OPENROUTER_ACCOUNT_KEY');
  });

  it('never invalidates an upstream proxy read on a live change', () => {
    const named = liveModules().flatMap((file) =>
      invalidatedKeys(
        file === LIVE_INVALIDATIONS
          ? withoutNotLive(readFileSync(file, 'utf8'))
          : readFileSync(file, 'utf8'),
      ),
    );
    expect(named.length).toBeGreaterThan(0);
    const offending = named.filter((name) =>
      [...upstream.keys()].some((target) => covers(keyOf(name), keyOf(target))),
    );
    expect(offending).toEqual([]);
  });
});
