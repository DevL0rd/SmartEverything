import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationSource } from './repository-files';

const plugins = join(applicationSource, 'plugins');

interface Section {
  readonly plugin: string;
  readonly key: string;
  readonly component: string;
  readonly scrolls: boolean;
}

function sectionsOf(plugin: string, source: string): readonly Section[] {
  const block = /deviceSections:\s*\[([\s\S]*?)\n {2}\],/.exec(source)?.[1] ?? '';
  return block
    .split(/\n {4}\{/)
    .slice(1)
    .map((entry) => ({
      plugin,
      key: /key:\s*'([^']+)'/.exec(entry)?.[1] ?? '',
      component: /render:[^<]*<(\w+)/.exec(entry)?.[1] ?? '',
      scrolls: /scrolls:\s*true/.test(entry),
    }));
}

function componentFile(index: string, source: string, component: string): string | null {
  const from = new RegExp(`import \\{[^}]*\\b${component}\\b[^}]*\\} from '(\\.[^']+)'`).exec(
    source,
  )?.[1];
  if (from === undefined) return null;
  const base = resolve(dirname(index), from);
  return [`${base}.tsx`, `${base}.ts`].find((file) => existsSync(file)) ?? null;
}

function rendersVirtualList(file: string | null): boolean {
  return file !== null && readFileSync(file, 'utf8').includes("components/virtual-list'");
}

const sections = readdirSync(plugins, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(plugins, entry.name, 'index.tsx')))
  .flatMap((entry) => {
    const index = join(plugins, entry.name, 'index.tsx');
    const source = readFileSync(index, 'utf8');
    return sectionsOf(entry.name, source).map((section) => ({
      ...section,
      list: rendersVirtualList(componentFile(index, source, section.component)),
    }));
  });

describe('device sections that render a virtual list', () => {
  it('finds the plugin device sections', () => {
    expect(sections.some((section) => section.list)).toBe(true);
  });

  it('declare scrolls so the device page does not nest them in a ScrollView', () => {
    const nested = sections
      .filter((section) => section.list && !section.scrolls)
      .map((section) => `${section.plugin}/${section.key}`);
    expect(nested).toEqual([]);
  });
});
