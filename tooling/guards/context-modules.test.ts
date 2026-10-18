import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applicationRoutes, applicationSource, filesUnder, insideApp } from './repository-files';

const CREATES_CONTEXT = /\bcreateContext\s*[<(]/;

const RUNTIME_DEPENDENCY = /^(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?'([^']+)'/gm;

const NOT_YET_MOVED: Readonly<Record<string, string>> = {
  'src/components/adaptive-panel.tsx': 'FrameContext has a non-null default',
  'src/components/keyboard-list.tsx': 'ListContext throws KeyboardRowOutsideListError on refresh',
  'src/components/screen-context.ts': 'ScreenContext and HeaderSlotContext have non-null defaults',
  'src/design/visibility.tsx': 'ScopeVisible and TileTracked have boolean defaults',
  'src/features/assistant/browser/browser-action-scope.ts':
    'BrowserActionScope has a boolean default',
  'src/features/assistant/chats/engine-accessories.tsx':
    'EngineAccessoryContext reads null quietly',
  'src/features/assistant/details/details-scope.tsx': 'Scope throws on refresh',
  'src/features/automations/editor/editor-focus.tsx': 'FocusContext has a non-null default',
  'src/features/devices/card/standalone-shell.tsx': 'ShellContext reads null quietly',
  'src/features/device-visuals/parts/material.tsx': 'LightingContext has a non-null default',
  'src/features/fitness/data/today.ts': 'TodayContext throws TodayContextMissingError on refresh',
  'src/features/home/data/home-data.ts': 'HomeDataContext throws HomeDataMissingError on refresh',
  'src/perf/screen-probe.tsx': 'LayerContext has a string default',
  'src/platform/browser-overlays.ts': 'BrowserOverlayOwner reads null quietly',
  'src/settings/availability.tsx': 'BuiltPagesContext throws NoBuiltPagesError on refresh',
};

const contextModules = [...filesUnder(applicationSource), ...filesUnder(applicationRoutes)]
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .map((file) => ({ file: insideApp(file), source: readFileSync(file, 'utf8') }))
  .filter(({ source }) => CREATES_CONTEXT.test(source));

function runtimeDependencies(source: string): readonly string[] {
  return [...source.matchAll(RUNTIME_DEPENDENCY)].flatMap(([, dependency]) =>
    dependency === undefined || dependency === 'react' ? [] : [dependency],
  );
}

const withDependencies = new Set(
  contextModules
    .filter(({ source }) => runtimeDependencies(source).length > 0)
    .map(({ file }) => file),
);

describe('React contexts survive a fast refresh', () => {
  it('creates every context in a module that imports nothing at runtime but react, so a refresh that re-runs its importers keeps the same context object', () => {
    expect([...withDependencies].filter((file) => !(file in NOT_YET_MOVED))).toEqual([]);
  });

  it('every listed module still creates a context with runtime dependencies', () => {
    expect(Object.keys(NOT_YET_MOVED).filter((file) => !withDependencies.has(file))).toEqual([]);
  });

  it('keeps the paired store context in its own leaf module', () => {
    expect(contextModules.map(({ file }) => file)).toContain('src/store/store-runtime.ts');
    expect(withDependencies.has('src/store/store-runtime.ts')).toBe(false);
  });
});
