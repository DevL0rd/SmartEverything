import { describe, expect, it } from 'vitest';
import { buildGraph, scopeOf, topsOf } from './projects.ts';

const graph = buildGraph();

describe('project graph', () => {
  it('reads the references of the root solution', () => {
    expect([...graph.keys()]).toEqual(expect.arrayContaining(['packages/domain', 'apps/hub']));
    expect(graph.get('apps/hub')).toContain('packages/domain');
  });

  it('checks the owning project of a hub edit and the desktop that embeds it', () => {
    const scope = scopeOf(['apps/hub/src/index.ts'], graph);
    expect(scope).toEqual({
      all: false,
      projects: ['apps/desktop', 'apps/hub'],
      tops: ['apps/desktop'],
    });
  });

  it('adds the dependents of a shared package and keeps the leaf projects', () => {
    const scope = scopeOf(['packages/domain/src/index.ts'], graph);
    expect(scope.projects).toEqual(
      expect.arrayContaining(['packages/domain', 'apps/hub', 'apps/app']),
    );
    expect(scope.tops).not.toContain('packages/domain');
    expect(scope.tops).toContain('apps/desktop');
    expect(scope.tops).not.toContain('apps/hub');
  });

  it('checks everything for a root configuration change', () => {
    expect(scopeOf(['tsconfig.base.json'], graph).all).toBe(true);
    expect(scopeOf(['pnpm-lock.yaml'], graph).all).toBe(true);
  });

  it('checks nothing when no type-relevant file changed', () => {
    expect(scopeOf(['docs/STANDARDS.md', 'apps/app/android/App.kt'], graph)).toEqual({
      all: false,
      projects: [],
      tops: [],
    });
  });

  it('keeps a project that nothing else in the set depends on', () => {
    expect(topsOf(graph, new Set(['packages/logging', 'apps/hub']))).toEqual(['apps/hub']);
  });
});
