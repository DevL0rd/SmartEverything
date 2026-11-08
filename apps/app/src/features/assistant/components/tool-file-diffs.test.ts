import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('../../../components/text', () => ({ Text: 'Text' }));
vi.mock('../../../components/interactive', () => ({ Interactive: 'Interactive' }));
vi.mock('../../../components/diff-code', () => ({ DiffCode: 'DiffCode' }));
vi.mock('./recorded-diff-source', () => ({ RecordedDiffSourceSheet: 'Sheet' }));

const { FileDiffList, workspaceFileDiff } = await import('./tool-file-diffs');

const base = {
  path: '/work/src/lamp.ts',
  display: 'src/lamp.ts',
  added: 1,
  deleted: 1,
  binary: false,
  oversized: false,
};

describe('workspaceFileDiff', () => {
  it('numbers hunk lines and keeps context apart from the changed lines', () => {
    const diff = workspaceFileDiff({
      ...base,
      diff: {
        kind: 'text',
        before: true,
        after: true,
        coarse: false,
        hunks: [
          {
            old_start: 4,
            old_lines: 2,
            new_start: 4,
            new_lines: 2,
            lines: [' const a = 1;', '-const b = 2;', '+const b = 3;'],
          },
        ],
      },
    });
    expect(diff.path).toBe('src/lamp.ts');
    expect(diff.operation).toBe('update');
    expect(diff.lines).toEqual([
      { kind: 'remove', text: 'const b = 2;', oldLine: 5, newLine: null },
      { kind: 'add', text: 'const b = 3;', oldLine: null, newLine: 5 },
    ]);
    expect(diff.contextLines[0]).toEqual({
      kind: 'context',
      text: 'const a = 1;',
      oldLine: 4,
      newLine: 4,
    });
    expect([diff.added, diff.removed]).toEqual([1, 1]);
  });

  it('marks new and removed files and explains files without line comparisons', () => {
    const created = workspaceFileDiff({
      ...base,
      diff: { kind: 'text', before: false, after: true, coarse: false, hunks: [] },
    });
    expect(created.operation).toBe('create');
    const binary = workspaceFileDiff({ ...base, binary: true, diff: { kind: 'binary' } });
    expect([binary.message, binary.added, binary.lines]).toEqual([
      'Binary file · no line comparison',
      null,
      [],
    ]);
    expect(
      workspaceFileDiff({ ...base, oversized: true, diff: { kind: 'oversized' } }).message,
    ).toBe('Too large to compare line by line');
  });
});

describe('FileDiffList', () => {
  const diff = workspaceFileDiff({
    ...base,
    added: 2,
    deleted: 1,
    diff: {
      kind: 'text',
      before: true,
      after: true,
      coarse: false,
      hunks: [
        {
          old_start: 1,
          old_lines: 1,
          new_start: 1,
          new_lines: 2,
          lines: ['-set: 10', '+set: 15', '+on: fri'],
        },
      ],
    },
  });

  it('heads each file with its name and separate added and removed counts', () => {
    const markup = renderToStaticMarkup(createElement(FileDiffList, { diffs: [diff] }));
    expect(markup).toContain('src/lamp.ts');
    expect(markup).toContain('+2');
    expect(markup).toContain('−1');
    expect(markup).not.toContain('language unavailable');
  });

  it('offers context as one footnote action and no expand action for a short diff', () => {
    const markup = renderToStaticMarkup(createElement(FileDiffList, { diffs: [diff] }));
    expect(markup).toContain('Show context');
    expect(markup).not.toContain('Show more changes');
  });
});
