import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { installedVersion, repositoryFile } from './versions';
import { appDeclaredVersion } from './app-manifest';

describe('@tanstack/react-query contract', () => {
  it('is installed at exactly the version the app declares', () => {
    expect(installedVersion('@tanstack/react-query')).toBe(
      appDeclaredVersion('@tanstack/react-query'),
    );
  });

  it('still declares the focus and online managers the app drives itself', () => {
    const types = readFileSync(
      repositoryFile('node_modules/@tanstack/query-core/build/modern/index.d.ts'),
      'utf8',
    );
    expect(types).toContain('focusManager');
    expect(types).toContain('onlineManager');
  });

  it('ships the React bindings the app renders through', () => {
    expect(
      existsSync(repositoryFile('node_modules/@tanstack/react-query/build/modern/index.js')),
    ).toBe(true);
  });

  it('is version 5, whose useQuery reports isPending rather than isLoading', () => {
    expect(installedVersion('@tanstack/react-query').startsWith('5.')).toBe(true);
  });

  it('is the store every screen reads through, not one screen among many', () => {
    const root = readFileSync(repositoryFile('apps/app/src/features/root/app-root.tsx'), 'utf8');
    expect(root).toContain('PersistQueryClientProvider');
  });
});
