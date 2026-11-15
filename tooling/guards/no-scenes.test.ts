import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  API_ENDPOINTS,
  CHAT_WIDGET_GUIDE,
  MCP_PART_NAMES,
  MCP_TOOL_NAMES,
  NODE_REGISTRY,
  OPTION_SOURCES,
  REF_KINDS,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  applicationRoutes,
  applicationSource,
  filesUnder,
  repositoryRoot,
} from './repository-files';

const SCENE_WORD = /scene/iu;

const PRODUCT_SCENE = /^(?!.*vacuum).*scene/iu;

const SCENE_LINKS =
  /href\.scenes?\b|\/automations\/scenes|automations\.scenes|useRows\('scenes'\)|tables\.scenes/u;

function pathsOf(from: string): readonly string[] {
  return filesUnder(from).map((file) => relative(repositoryRoot, file).replace(/\\/gu, '/'));
}

describe('Scenes are gone from the product', () => {
  it('has no scene route in the app', () => {
    expect(pathsOf(applicationRoutes).filter((path) => SCENE_WORD.test(path))).toEqual([]);
  });

  it('has no scene screen, link or table read in the app source', () => {
    const product = filesUnder(applicationSource).filter((file) => /\.tsx?$/u.test(file));
    const linked = product.filter((file) => SCENE_LINKS.test(readFileSync(file, 'utf8')));
    expect(linked.map((file) => relative(repositoryRoot, file))).toEqual([]);
    expect(
      pathsOf(applicationSource).filter((path) =>
        /features\/automations\/scenes\/|features\/home\/.*scene|devices\/remote\/scene/iu.test(
          path,
        ),
      ),
    ).toEqual([]);
  });

  it('has no scene tool, operation, endpoint, node, reference or chat widget', () => {
    expect(MCP_TOOL_NAMES.filter((name) => PRODUCT_SCENE.test(name))).toEqual([]);
    expect(MCP_PART_NAMES.filter((name) => PRODUCT_SCENE.test(name))).toEqual([]);
    expect(
      Object.entries(API_ENDPOINTS)
        .filter(
          ([name, endpoint]) => endpoint.path.includes('/api/scenes') || PRODUCT_SCENE.test(name),
        )
        .map(([name]) => name),
    ).toEqual([]);
    expect(NODE_REGISTRY.kinds.filter((kind) => kind.id.startsWith('scene.'))).toEqual([]);
    expect(REF_KINDS.filter((kind) => SCENE_WORD.test(kind))).toEqual([]);
    expect(OPTION_SOURCES.filter((source) => SCENE_WORD.test(source.id))).toEqual([]);
    expect(Object.keys(CHAT_WIDGET_GUIDE).filter((kind) => SCENE_WORD.test(kind))).toEqual([]);
  });
});
