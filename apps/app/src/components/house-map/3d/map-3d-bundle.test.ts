import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const VALUE_IMPORT = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)';/gmsu;

function valueImports(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(VALUE_IMPORT)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function localFile(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  const found = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((path) => existsSync(path));
  return found ?? null;
}

function graphOf(entry: string | readonly string[]): {
  readonly files: Set<string>;
  readonly packages: Set<string>;
} {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = typeof entry === 'string' ? [entry] : [...entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of valueImports(file)) {
      const local = localFile(file, spec);
      if (local === null) {
        if (!spec.startsWith('.')) packages.add(spec);
      } else {
        queue.push(local);
      }
    }
  }
  return { files, packages };
}

describe('the 3D map web view bundle', () => {
  it('pulls in only the 3D map, the pure shared map and model kits, three with its geometry helpers, the Spark splat renderer, the pure text ordering helpers, zod, logging and the narrow domain files', () => {
    const { files, packages } = graphOf(resolve(here, 'map-3d.tsx'));
    const allowed = new Set([
      '@sparkjsdev/spark',
      '@smarteverything/domain/home-map',
      '@smarteverything/domain/home-map-edit-core',
      '@smarteverything/domain/home-map-elements',
      '@smarteverything/domain/home-map-geometry',
      '@smarteverything/domain/home-map-openings',
      '@smarteverything/domain/home-map-placement',
      '@smarteverything/domain/model-footprint',
      '@smarteverything/domain/model-placement',
      '@smarteverything/domain/model-spec',
      '@smarteverything/domain/vacuum-finish',
      '@smarteverything/domain/vacuum-scene',
      '@smarteverything/logging',
      'expo/dom',
      'react',
      'three',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'zod',
    ]);
    expect([...packages].filter((name) => !allowed.has(name))).toEqual([]);
    expect(packages.has('@smarteverything/domain')).toBe(false);
    expect(
      [...files].every(
        (file) =>
          file.includes('/components/house-map/') ||
          file.includes('/components/models/') ||
          file.includes('/design/') ||
          file.endsWith('/format/text.ts') ||
          file.endsWith('/format/locale.ts'),
      ),
    ).toBe(true);
  });

  it('keeps the shared edit core free of React Native, react and every app module outside the house map folder', () => {
    const editDir = resolve(here, '../edit');
    const entries = readdirSync(editDir)
      .filter((name) => /\.tsx?$/u.test(name) && !/\.test\.tsx?$/u.test(name))
      .map((name) => resolve(editDir, name));
    expect(entries.length).toBeGreaterThan(0);
    const { files, packages } = graphOf(entries);
    const allowed = new Set([
      '@smarteverything/domain/home-map-edit-core',
      '@smarteverything/domain/home-map-geometry',
      '@smarteverything/domain/model-placement',
    ]);
    expect([...packages].filter((name) => !allowed.has(name))).toEqual([]);
    expect([...files].every((file) => file.includes('/components/house-map/'))).toBe(true);
  });
});
