import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationSource as source, filesUnder, insideApp } from './repository-files';

const RANK: Readonly<Record<string, number>> = { features: 3, ui: 2, data: 1 };

const IMPORT = /from '(\.{1,2}\/[^']+)'/g;

interface Edge {
  readonly from: string;
  readonly to: string;
}

function layerOf(file: string): { readonly layer: string; readonly area: string } {
  const [layer = '', area = ''] = relative(source, file).split('/');
  return { layer, area };
}

function edges(): readonly Edge[] {
  return filesUnder(source)
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((match) => ({
        from: file,
        to: resolve(dirname(file), match[1] ?? ''),
      })),
    )
    .filter((edge) => edge.to.startsWith(`${source}/`));
}

function describeEdge(edge: Edge): string {
  return `${insideApp(edge.from)} → ${insideApp(edge.to)}`;
}

describe('the layers of the application', () => {
  const all = edges();

  it('finds the imports it judges', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('never imports from a layer above', () => {
    const upward = all.filter((edge) => {
      const from = RANK[layerOf(edge.from).layer];
      const to = RANK[layerOf(edge.to).layer];
      return from !== undefined && to !== undefined && to > from;
    });
    expect(upward.map(describeEdge)).toStrictEqual([]);
  });

  it('never imports one feature from another', () => {
    const across = all.filter((edge) => {
      const from = layerOf(edge.from);
      const to = layerOf(edge.to);
      return from.layer === 'features' && to.layer === 'features' && from.area !== to.area;
    });
    expect(across.map(describeEdge)).toStrictEqual([]);
  });
});
