import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationRoutes, applicationSource, filesUnder, insideApp } from './repository-files';
import { rendersSearch, routesReaching, searchesOutsideTheShell } from './search-placement';

const DELETED_SHELLS = [
  'src/components/screen.tsx',
  'src/components/page-header.tsx',
  'src/components/section-body.tsx',
  'src/components/master-detail.tsx',
  'src/components/frame-layout.ts',
  'src/components/section-rail.tsx',
  'src/components/library-frame/library-frame.tsx',
  'src/features/automations/hosts/page-shell.tsx',
];

const SHELLS = [
  join(applicationSource, 'components', 'page-shell', 'page-shell.tsx'),
  join(applicationSource, 'components', 'flow-frame.tsx'),
];

const APP_CHROME: readonly string[] = [];

const AUTOMATION_EDITOR = [
  'app/(app)/(z-assistant,automations)/automations/[automationId]/edit.tsx',
  'app/(app)/(z-assistant,automations)/automations/[automationId]/runs/[runId].tsx',
  'app/(app)/(z-assistant,automations)/automations/nodes/[functionId]/edit.tsx',
];

const HOME_MAP_EDITOR = ['app/(app)/(z-assistant,home,devices)/home-map/edit.tsx'];

const ANY_FORM = ['form control'];

const SEARCH_PANELS: ReadonlyMap<string, readonly string[]> = new Map([
  ['src/search/sidebar-search.tsx', APP_CHROME],
  ['src/search/search-popover.tsx', APP_CHROME],
  ['src/app-shell/nav-sheet-body.tsx', APP_CHROME],
  ['src/features/automations/editor/inspector/values/wire-picker.tsx', AUTOMATION_EDITOR],
  ['src/features/automations/editor/palette/palette-body.tsx', AUTOMATION_EDITOR],
  ['src/features/home-map/editor/tools/catalogue-panel.tsx', HOME_MAP_EDITOR],
  ['src/features/home-map/editor/tools/device-tray.tsx', HOME_MAP_EDITOR],
  ['src/components/schema-editor.tsx', ANY_FORM],
]);

const RAIL_IMPORT = /import \{[^}]*\b(?:SectionRail|RailItem|RailGroups)\b[^}]*\} from/u;

const SECTION_SWITCHES = /\bphoneTabs\b|\bsectionsPullUp\b|\bSectionsPullUp\b/u;

const LARGE_SHELL_TITLE = /<ShellTitle\b[^>]*\bsize="large"/u;

const ANY_IMPORT = /from '(\.[^']+)'/gu;

const VALUE_IMPORT = /(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?'(\.[^']+)'/gu;

const sources = filesUnder(applicationSource)
  .filter((file) => /\.tsx?$/u.test(file) && !/\.test\.tsx?$/u.test(file))
  .map((file) => ({ file, path: insideApp(file), text: readFileSync(file, 'utf8') }));

const textOf = new Map(sources.map((source) => [source.file, source.text]));

function resolved(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  const candidates = [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function reachesShell(start: string): boolean {
  const seen = new Set<string>();
  const queue = [start];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (SHELLS.includes(file)) return true;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = textOf.get(file) ?? readFileSync(file, 'utf8');
    for (const match of text.matchAll(VALUE_IMPORT)) {
      const spec = match[1];
      const target = spec === undefined ? null : resolved(file, spec);
      if (target !== null && !seen.has(target)) queue.push(target);
    }
  }
  return false;
}

const routes = filesUnder(applicationRoutes)
  .filter((file) => file.endsWith('.tsx') && !/(?:_layout|\+html|\+not-found)\.tsx$/u.test(file))
  .map((file) => ({ file, path: insideApp(file), text: readFileSync(file, 'utf8') }))
  .filter((route) => !/<Redirect\b/u.test(route.text));

describe('the page shell', () => {
  it('keeps the old page shells deleted and unimported', () => {
    const appRoot = dirname(applicationSource);
    expect(DELETED_SHELLS.filter((path) => existsSync(join(appRoot, path)))).toEqual([]);
    const gone = new Set(DELETED_SHELLS.map((path) => join(appRoot, path).replace(/\.tsx?$/u, '')));
    const importers = sources
      .filter((source) =>
        [...source.text.matchAll(ANY_IMPORT)].some(
          (match) => match[1] !== undefined && gone.has(resolve(dirname(source.file), match[1])),
        ),
      )
      .map((source) => source.path);
    expect(importers).toEqual([]);
  });

  it('finds the route pages', () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  it('renders every route page inside PageShell, its overlay and pane forms, or a flow', () => {
    const outside = routes.filter((route) => !reachesShell(route.file)).map((route) => route.path);
    expect(outside).toEqual([]);
  });

  it('puts every page search in the shell search slot, leaving others to pickers, sheets and dialogs', () => {
    expect(sources.filter(rendersSearch).length).toBeGreaterThan(20);
    const outside = searchesOutsideTheShell(sources, routes);
    const unexplained = outside.filter((path) => {
      const allowed = SEARCH_PANELS.get(path);
      if (allowed === undefined) return true;
      if (allowed === ANY_FORM) return false;
      const reached = routesReaching(sources, routes, path);
      if (allowed.length > 0 && reached.length === 0) return true;
      return reached.some((route) => !allowed.includes(route));
    });
    expect(unexplained).toEqual([]);
    expect([...SEARCH_PANELS.keys()].filter((path) => !outside.includes(path))).toEqual([]);
  });

  it('keeps the section rail as the only section navigation, with no section tabs or pull-up', () => {
    const found = sources
      .filter((source) => SECTION_SWITCHES.test(source.text))
      .map((source) => source.path);
    expect(found).toEqual([]);
    const parts = textOf.get(
      join(applicationSource, 'components', 'page-shell', 'shell-parts.tsx'),
    );
    expect(parts).toBeDefined();
    expect(parts).not.toMatch(/chevronDown|PressableTitle/u);
  });

  it('draws page search in the top bar only, never as a row of its own', () => {
    const drawn = sources
      .filter((source) => /<ShellSearch\b/u.test(source.text))
      .map((source) => source.path);
    expect(drawn).toEqual(['src/components/page-shell/bar-search.tsx']);
  });

  it('shows the page title in the top bar only, never as a large title row', () => {
    const shellFiles = sources.filter(
      (source) =>
        source.path.startsWith('src/components/page-shell/') ||
        source.path === 'src/components/flow-frame.tsx',
    );
    expect(shellFiles.length).toBeGreaterThan(0);
    expect(
      shellFiles
        .filter((source) => /large-title|'large'\s*:/u.test(source.text))
        .map((s) => s.path),
    ).toEqual([]);
    expect(
      sources.filter((source) => LARGE_SHELL_TITLE.test(source.text)).map((source) => source.path),
    ).toEqual([]);
  });

  it('draws every section sidebar with the one shared section rail', () => {
    const own = sources
      .filter((source) => !source.path.startsWith('src/components/page-shell/'))
      .filter((source) => RAIL_IMPORT.test(source.text))
      .map((source) => source.path);
    expect(own).toEqual([]);
  });
});
