import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applicationRoutes, applicationSource, filesUnder, insideApp } from './repository-files';

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

const OWN_BAR_ROUTES = new Set(['app/(app)/(photos)/photos/view/[itemId]/edit.tsx']);

const SEARCH_FIELD_USERS = new Set([
  'src/components/page-shell/search-slot.tsx',
  'src/search/sidebar-search.tsx',
  'src/search/search-popover.tsx',
  'src/search/pin-picker.tsx',
  'src/app-shell/nav-sheet-body.tsx',
  'src/app-shell/shortcut-help.tsx',
  'src/components/emoji-picker.tsx',
  'src/components/schema-editor.tsx',
  'src/components/select-picker.tsx',
  'src/components/transcript-feed/feed-chrome.tsx',
  'src/components/widget-board/edit/gallery-browse-step.tsx',
  'src/components/widget-board/edit/gallery-target-step.tsx',
  'src/features/assistant/access/access-tools-page.tsx',
  'src/features/assistant/extensions/devices-sheet.tsx',
  'src/features/assistant/picker/image/image-library-body.tsx',
  'src/features/assistant/picker/library/library-tools.tsx',
  'src/features/assistant/provider/provider-work-sheet.tsx',
  'src/features/assistant/voice-preview/voice-preview-picker.tsx',
  'src/features/automations/editor/inspector/values/option-picker.tsx',
  'src/features/automations/editor/inspector/values/wire-picker.tsx',
  'src/features/automations/editor/palette/palette-body.tsx',
  'src/features/clock/alarm/sound-music.tsx',
  'src/features/clock/alarm/sound-radio.tsx',
  'src/features/device-groups/member-picker.tsx',
  'src/features/devices/appliance/library-steps.tsx',
  'src/features/devices/laundry/program-picker.tsx',
  'src/features/home-map/editor/tools/catalogue-panel.tsx',
  'src/features/home-map/editor/tools/device-tray.tsx',
  'src/features/photos/organise/meta/location-section.tsx',
  'src/features/planner/item/attachment-picker.tsx',
  'src/features/plugins/picker/option-picker-sheet.tsx',
  'src/features/settings/home/location-sheet.tsx',
]);

const SEARCH_FIELD_IMPORT = /from '[^']*\/search-field'/u;

const RAIL_IMPORT = /import \{[^}]*\b(?:SectionRail|RailItem|RailGroups)\b[^}]*\} from/u;

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
    const outside = routes
      .filter((route) => !OWN_BAR_ROUTES.has(route.path) && !reachesShell(route.file))
      .map((route) => route.path);
    expect(outside).toEqual([]);
  });

  it('does not keep an allowance for a route page that now reaches the shell', () => {
    const moved = routes
      .filter((route) => OWN_BAR_ROUTES.has(route.path) && reachesShell(route.file))
      .map((route) => route.path);
    expect(moved).toEqual([]);
    const known = new Set(routes.map((route) => route.path));
    expect([...OWN_BAR_ROUTES].filter((path) => !known.has(path))).toEqual([]);
  });

  it('puts page search in the shell search slot and keeps SearchField to pickers and sheets', () => {
    const users = sources
      .filter((source) => SEARCH_FIELD_IMPORT.test(source.text))
      .map((source) => source.path);
    expect(users.filter((path) => !SEARCH_FIELD_USERS.has(path))).toEqual([]);
    expect([...SEARCH_FIELD_USERS].filter((path) => !users.includes(path))).toEqual([]);
  });

  it('draws every section sidebar with the one shared section rail', () => {
    const own = sources
      .filter((source) => !source.path.startsWith('src/components/page-shell/'))
      .filter((source) => RAIL_IMPORT.test(source.text))
      .map((source) => source.path);
    expect(own).toEqual([]);
  });
});
