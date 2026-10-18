import { describe, expect, it } from 'vitest';
import type { Run } from './process.ts';
import { affectsTypes, countErrors, judge, owningProject, parseTsc } from './types.ts';

const EDITED = 'apps/hub/src/edited.ts';
const OTHER = 'apps/hub/src/other.ts';

function failing(...lines: readonly string[]): Run {
  return { code: 2, timedOut: false, stdout: `${lines.join('\n')}\n`, stderr: '', detail: '' };
}

function at(file: string, message: string, row = 1): string {
  return `${file}(${String(row)},4): error TS2322: ${message}`;
}

describe('parseTsc', () => {
  it('reads located errors with position, code and message', () => {
    expect(parseTsc(at(EDITED, 'bad', 7))).toEqual([
      {
        file: EDITED,
        key: `${EDITED}\tTS2322\tbad`,
        text: `${EDITED} 7:4 TS2322 bad`,
      },
    ]);
  });

  it('reads unlocated errors as whole lines', () => {
    const line = "error TS5083: Cannot read file '/x/tsconfig.json'.";
    expect(parseTsc(line)).toEqual([{ file: null, key: line, text: line }]);
  });

  it('ignores continuation lines, blank lines and non-errors', () => {
    const output = ['', '  Type is not assignable', 'Found 1 error.', at(EDITED, 'bad')].join('\n');
    expect(parseTsc(output)).toHaveLength(1);
  });
});

describe('countErrors', () => {
  it('counts identical errors on different lines together', () => {
    const output = [at(EDITED, 'bad', 1), at(EDITED, 'bad', 9), at(OTHER, 'bad')].join('\n');
    expect(countErrors(output)).toEqual({
      [`${EDITED}\tTS2322\tbad`]: 2,
      [`${OTHER}\tTS2322\tbad`]: 1,
    });
  });

  it('is empty for clean output', () => {
    expect(countErrors('')).toEqual({});
  });
});

describe('judge', () => {
  const snapshot = { counts: countErrors(at(OTHER, 'old')) };

  it('passes a clean run', () => {
    const clean = { ...failing(), code: 0 };
    expect(judge('tsc -b', clean, { files: [EDITED], snapshot })).toEqual([]);
  });

  it('reports an error planted in an edited file', () => {
    const sections = judge('tsc -b', failing(at(EDITED, 'planted')), {
      files: [EDITED],
      snapshot,
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.lines).toEqual([`${EDITED} 1:4 TS2322 planted`]);
  });

  it('ignores pre-existing errors in files that were not edited', () => {
    const sections = judge('tsc -b', failing(at(OTHER, 'old')), { files: [EDITED], snapshot });
    expect(sections).toEqual([]);
  });

  it('reports an error whose count grew elsewhere', () => {
    const run = failing(at(OTHER, 'old', 1), at(OTHER, 'old', 5));
    const sections = judge('tsc -b', run, { files: [EDITED], snapshot });
    expect(sections[0]?.lines).toEqual([`${OTHER} 5:4 TS2322 old`]);
  });

  it('reports a brand new error elsewhere', () => {
    const sections = judge('tsc -b', failing(at(OTHER, 'new')), { files: [EDITED], snapshot });
    expect(sections[0]?.lines).toEqual([`${OTHER} 1:4 TS2322 new`]);
  });

  it('counts only edited files when the snapshot failed or is missing', () => {
    const run = failing(at(EDITED, 'mine'), at(OTHER, 'theirs'));
    const failed = judge('tsc -b', run, { files: [EDITED], snapshot: { failed: 'it timed out' } });
    expect(failed[0]?.lines).toEqual([
      'it timed out, so only errors in edited files count',
      `${EDITED} 1:4 TS2322 mine`,
    ]);
    const missing = judge('tsc -b', run, { files: [EDITED], snapshot: null });
    expect(missing[0]?.lines[0]).toContain('no snapshot was taken');
    expect(missing[0]?.lines).toHaveLength(2);
  });

  it('shows tsc output when it failed without file-level errors', () => {
    const run = { ...failing(), stdout: '', stderr: 'tsc crashed' };
    const sections = judge('tsc -b', run, { files: [EDITED], snapshot });
    expect(sections[0]?.lines).toEqual(['tsc crashed']);
  });
});

describe('project detection', () => {
  it('treats sources and manifests as type-relevant', () => {
    expect(affectsTypes('apps/hub/src/a.ts')).toBe(true);
    expect(affectsTypes('apps/hub/package.json')).toBe(true);
    expect(affectsTypes('apps/hub/tsconfig.build.json')).toBe(true);
    expect(affectsTypes('README.md')).toBe(false);
  });

  it('finds the nearest tsconfig folder', () => {
    expect(owningProject('tooling/claude-hook/types.ts')).toBe('tooling');
    expect(owningProject('vitest.config.ts')).toBeNull();
  });
});
