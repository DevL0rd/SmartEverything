import { relative, isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hubLayout,
  layoutFromNames,
  LEGACY_NAMES,
  nodeLayout,
  V1_NAMES,
  type HubLayout,
  type LayoutNames,
} from '../../src/data-layout';

const ROOT = resolve('/srv/hub-data');
const ENVIRONMENT = {
  CLAUDE_CONFIG_DIR: join(ROOT, 'vendor', 'claude'),
  CODEX_HOME: join(ROOT, 'vendor', 'codex'),
};

function strings(value: unknown): readonly string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

function allPaths(layout: HubLayout): readonly string[] {
  return [
    ...strings(layout),
    ...strings(layout.person('p1')),
    ...strings(layout.chat('p1', 'c1')),
    layout.person('p1').attachment('a1', 'photo.png'),
    layout.system.providers('xiaomi'),
    layout.system.plugins('aibi'),
    layout.system.journalCursor('dev-1'),
    layout.home.recordings('cam-1'),
    layout.cache.derived('item-1'),
  ];
}

function inside(path: string): boolean {
  const rel = relative(ROOT, path);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

const TABLES: readonly (readonly [string, LayoutNames])[] = [
  ['legacy', LEGACY_NAMES],
  ['v1', V1_NAMES],
];

describe.each(TABLES)('hubLayout %s names', (_name, names) => {
  const layout = layoutFromNames(ROOT, names, ENVIRONMENT);

  it('keeps every path inside the root', () => {
    for (const path of allPaths(layout)) {
      expect(isAbsolute(path)).toBe(true);
      expect(inside(path)).toBe(true);
    }
  });

  it('gives every entry a distinct path', () => {
    const { marker, lock, tmp, system, home } = layout;
    const distinct = [
      marker,
      lock,
      tmp,
      ...strings(system.database),
      ...strings(system.keys),
      ...strings(system.run),
      ...strings(system.logs),
      ...strings(system.updates),
      ...strings(home),
    ];
    expect(new Set(distinct).size).toBe(distinct.length);
  });

  it.each([['..'], ['.'], [''], ['a/b'], ['a\\b'], ['a\0b']])(
    'refuses the id %j everywhere',
    (bad) => {
      expect(() => layout.person(bad)).toThrow();
      expect(() => layout.chat('p1', bad)).toThrow();
      expect(() => layout.chat(bad, 'c1')).toThrow();
      expect(() => layout.person('p1').attachment(bad, 'x')).toThrow();
      expect(() => layout.person('p1').attachment('a', bad)).toThrow();
      expect(() => layout.home.recordings(bad)).toThrow();
      expect(() => layout.system.providers(bad)).toThrow();
      expect(() => layout.system.plugins(bad)).toThrow();
      expect(() => layout.system.journalCursor(bad)).toThrow();
      expect(() => layout.cache.derived(bad)).toThrow();
    },
  );

  it('refuses an item id whose shard would leave the derived folder', () => {
    expect(() => layout.cache.derived('..x')).toThrow();
  });
});

describe('legacy names', () => {
  const layout = layoutFromNames(ROOT, LEGACY_NAMES, ENVIRONMENT);

  it('keeps today locations', () => {
    expect(layout.system.database.file).toBe(join(ROOT, 'smarteverything.db'));
    expect(layout.person('p1').attachment('a1', 'x.png')).toBe(
      join(ROOT, 'assistant', 'files', 'a1', 'x.png'),
    );
    expect(layout.chat('p1', 'c1').project).toBe(join(ROOT, 'assistant', 'projects', 'c1'));
    expect(layout.chat('p1', 'c1').codex).toBe(join(ROOT, 'codex', 'workspaces', 'c1'));
    expect(layout.home.recordings('cam-1')).toBe(join(ROOT, 'recordings', 'cam-1'));
    expect(layout.backups.releases).toBe(join(ROOT, 'release-backups'));
    expect(layout.tmp).toBe(join(ROOT, 'tmp'));
  });

  it('keeps derived Photos files in the two-character shard of the item id', () => {
    expect(layout.cache.derived('ab12cd')).toBe(join(ROOT, 'drive-derived', 'ab'));
  });

  it('keeps the SmartThings capability cache inside the provider folder', () => {
    expect(layout.cache.smartthingsCapabilities).toBe(
      join(ROOT, 'providers', 'smartthings', 'capabilities'),
    );
  });

  it('uses the vendor homes from the environment', () => {
    expect(layout.system.ai.claudeHome).toBe(ENVIRONMENT.CLAUDE_CONFIG_DIR);
    expect(layout.system.ai.codexHome).toBe(ENVIRONMENT.CODEX_HOME);
  });
});

describe('v1 names', () => {
  const layout = layoutFromNames(ROOT, V1_NAMES, ENVIRONMENT);

  it('splits system, home, people and cache', () => {
    expect(layout.system.database.file).toBe(
      join(ROOT, 'system', 'database', 'smarteverything.db'),
    );
    expect(layout.person('p1').attachment('a1', 'x.png')).toBe(
      join(ROOT, 'people', 'p1', 'attachments', 'a1', 'x.png'),
    );
    expect(layout.chat('p1', 'c1').project).toBe(
      join(ROOT, 'people', 'p1', 'chats', 'c1', 'project'),
    );
    expect(layout.system.ai.claudeHome).toBe(join(ROOT, 'system', 'ai', 'claude-home'));
    expect(layout.cache.derived('ab12cd')).toBe(join(ROOT, 'cache', 'drive-derived', 'ab'));
  });
});

describe('hubLayout', () => {
  it('uses the active source', () => {
    expect(hubLayout(ROOT, ENVIRONMENT).system.database.file).toBe(
      layoutFromNames(ROOT, LEGACY_NAMES, ENVIRONMENT).system.database.file,
    );
  });
});

describe('nodeLayout', () => {
  const layout = nodeLayout(ROOT);

  it('keeps every path inside the root', () => {
    const paths = [...strings(layout), layout.journalCursor('dev-1')].filter(
      (path) => path !== layout.root,
    );
    for (const path of paths) {
      expect(inside(path)).toBe(true);
    }
    expect(layout.ready).toBe(join(ROOT, 'service-ready.json'));
    expect(layout.computerNodeId).toBe(join(ROOT, 'computer-node.id'));
  });

  it('refuses unsafe device ids', () => {
    expect(() => layout.journalCursor('../x')).toThrow();
  });
});
