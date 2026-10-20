import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository-files';

const hubSource = join(repositoryRoot, 'apps', 'hub', 'src');
const hubEntry = join(hubSource, 'start.ts');

const IMPORT =
  /(?:^(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s+|^import\s+|\bimport\s*\(\s*)'([^']+)'/gm;

const SPOTTER_PACKAGE = 'sherpa-onnx';

const FORBIDDEN_FILES: readonly string[] = [
  'node/controls/linux/mic-capture.ts',
  'node/controls/linux/speaker-playback.ts',
  'node/controls/linux/mpris.ts',
];

const FORBIDDEN_DIRECTORIES: readonly string[] = ['node/ear/'];

interface Reached {
  readonly files: ReadonlySet<string>;
  readonly packages: ReadonlySet<string>;
  readonly names: (text: string) => readonly string[];
}

function sourceOf(specifier: string, from: string): string | null {
  const base = resolve(dirname(from), specifier);
  return (
    [`${base}.ts`, join(base, 'index.ts'), base].find(
      (one) => existsSync(one) && one.endsWith('.ts'),
    ) ?? null
  );
}

function packageOf(specifier: string): string {
  const [scope = '', name = ''] = specifier.split('/');
  return scope.startsWith('@') ? `${scope}/${name}` : scope;
}

function reachedFrom(entry: string): Reached {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const specifier = match[1] ?? '';
      if (specifier.startsWith('.')) {
        const next = sourceOf(specifier, file);
        if (next !== null) pending.push(next);
      } else if (!specifier.startsWith('node:')) {
        packages.add(packageOf(specifier));
      }
    }
  }
  return {
    files,
    packages,
    names: (text) => [...files].filter((one) => readFileSync(one, 'utf8').includes(text)),
  };
}

function insideHub(file: string): string {
  return relative(hubSource, file).replaceAll('\\', '/');
}

describe('the hub is a headless server', () => {
  const reached = reachedFrom(hubEntry);
  const places = [...reached.files].map(insideHub);

  it('finds the code the hub starts', () => {
    expect(places.length).toBeGreaterThan(200);
    expect(places).toContain('computers/extension.ts');
    expect(places).toContain('listening/remote-ears.ts');
    expect(reached.packages.has('zod')).toBe(true);
  });

  it('never loads the wake word spotter', () => {
    expect(reached.names(SPOTTER_PACKAGE).map(insideHub)).toEqual([]);
  });

  it('never reaches the ears that run on computers', () => {
    expect(
      places.filter((place) =>
        FORBIDDEN_DIRECTORIES.some((directory) => place.startsWith(directory)),
      ),
    ).toEqual([]);
  });

  it('never reaches a microphone, a speaker or a media player of the machine it runs on', () => {
    expect(places.filter((place) => FORBIDDEN_FILES.includes(place))).toEqual([]);
  });

  it('keeps the computer node on its own entry, where the ears live', () => {
    const node = reachedFrom(join(hubSource, 'node', 'bootstrap.ts'));
    const nodePlaces = [...node.files].map(insideHub);
    expect(nodePlaces).toContain('node/ear/ear-host.ts');
    expect(node.names(SPOTTER_PACKAGE).map(insideHub)).toEqual(['node/ear/sherpa.ts']);
  });
});
