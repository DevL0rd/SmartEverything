import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationSource as source, filesUnder, insideApp } from './repository-files';

const KIT_LAYERS: ReadonlySet<string> = new Set(['components', 'design', 'format']);

const LAYERS_ABOVE_KIT: ReadonlySet<string> = new Set([
  'store',
  'api',
  'queries',
  'features',
  'app-shell',
  'settings',
  'search',
]);

const FEATURE_WITHOUT_RULES = 'root';

const IMPORT = /from '(\.{1,2}\/[^']+)'/g;

interface Edge {
  readonly from: string;
  readonly to: string;
}

interface Place {
  readonly layer: string;
  readonly area: string;
  readonly inner: readonly string[];
}

function placeOf(file: string): Place {
  const [layer = '', area = '', ...inner] = relative(source, file).split('/');
  return { layer, area, inner };
}

function edgesOf(file: string, text: string): readonly Edge[] {
  return [...text.matchAll(IMPORT)].map((match) => ({
    from: file,
    to: resolve(dirname(file), match[1] ?? ''),
  }));
}

function edges(): readonly Edge[] {
  return filesUnder(source)
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap((file) => edgesOf(file, readFileSync(file, 'utf8')))
    .filter((edge) => edge.to.startsWith(`${source}/`));
}

function describeEdge(edge: Edge): string {
  return `${insideApp(edge.from)} → ${insideApp(edge.to)}`;
}

function reachesIntoKit(edge: Edge): boolean {
  return KIT_LAYERS.has(placeOf(edge.from).layer) && LAYERS_ABOVE_KIT.has(placeOf(edge.to).layer);
}

function reachesPastFeatureIndex(edge: Edge): boolean {
  const from = placeOf(edge.from);
  const to = placeOf(edge.to);
  const crosses =
    from.layer === 'features' &&
    from.area !== FEATURE_WITHOUT_RULES &&
    to.layer === 'features' &&
    to.area !== '' &&
    from.area !== to.area;
  const publicSurface = to.inner.length === 0 || (to.inner.length === 1 && to.inner[0] === 'index');
  return crosses && !publicSurface;
}

describe('the layers of the application', () => {
  const all = edges();

  it('finds the imports it judges', () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.some((edge) => KIT_LAYERS.has(placeOf(edge.from).layer))).toBe(true);
    expect(all.some((edge) => placeOf(edge.from).layer === 'features')).toBe(true);
  });

  it('keeps the kit, design and format layers free of data and features', () => {
    expect(all.filter(reachesIntoKit).map(describeEdge)).toStrictEqual([]);
  });

  it('imports another feature only through its index', () => {
    expect(all.filter(reachesPastFeatureIndex).map(describeEdge)).toStrictEqual([]);
  });

  it('judges a kit file that imports a feature and a feature that skips an index', () => {
    const kitToFeature = {
      from: `${source}/components/row.tsx`,
      to: `${source}/features/devices/index`,
    };
    const skipsIndex = {
      from: `${source}/features/home/home.tsx`,
      to: `${source}/features/devices/model/readings`,
    };
    const throughIndex = {
      from: `${source}/features/home/home.tsx`,
      to: `${source}/features/devices`,
    };
    const sameFeature = {
      from: `${source}/features/devices/a.ts`,
      to: `${source}/features/devices/model/readings`,
    };
    expect(reachesIntoKit(kitToFeature)).toBe(true);
    expect(reachesPastFeatureIndex(skipsIndex)).toBe(true);
    expect(reachesPastFeatureIndex(throughIndex)).toBe(false);
    expect(
      reachesPastFeatureIndex({ ...throughIndex, to: `${source}/features/devices/index` }),
    ).toBe(false);
    expect(reachesPastFeatureIndex(sameFeature)).toBe(false);
    expect(reachesIntoKit(skipsIndex)).toBe(false);
  });
});
