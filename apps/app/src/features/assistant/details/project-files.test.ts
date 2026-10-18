import { describe, expect, it } from 'vitest';
import type { AiProjectFile } from '@smarteverything/domain';
import { leafName, parentPath, sortedProjectEntries } from './project-files';

const entry = (path: string, type: 'file' | 'directory'): AiProjectFile => ({
  path,
  type,
  version: 'v',
  bytes: 1,
});

describe('project file entries', () => {
  it('lists folders before files, each by name', () => {
    const sorted = sortedProjectEntries([
      entry('workspace/b.ts', 'file'),
      entry('workspace/z', 'directory'),
      entry('workspace/a.ts', 'file'),
      entry('workspace/m', 'directory'),
    ]);
    expect(sorted.map((item) => item.path)).toEqual([
      'workspace/m',
      'workspace/z',
      'workspace/a.ts',
      'workspace/b.ts',
    ]);
  });

  it('walks up from a nested path and stops at the root', () => {
    expect(parentPath('workspace/src/app')).toBe('workspace/src');
    expect(parentPath('workspace/src')).toBe('workspace');
    expect(parentPath('workspace')).toBeNull();
    expect(leafName('workspace/src/app.ts')).toBe('app.ts');
  });
});
