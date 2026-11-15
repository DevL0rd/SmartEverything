import { describe, expect, it } from 'vitest';
import { limitOf, parseCheck, parseTap } from './posix-parse.ts';

const TAP = `/tests/chmod/00.t ..
1..4
ok 1
not ok 2 - expected 0 got EPERM
ok 3 # skip no root
not ok 4 # TODO later
/tests/link/01.t ..
1..1
not ok 1 - EXDEV
Files=2, Tests=5
Result: FAIL
`;

describe('parseTap', () => {
  it('counts passed, skipped and failed tests and names the failing file', () => {
    const summary = parseTap(TAP);
    expect(summary.passed).toBe(1);
    expect(summary.notRun).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.result).toBe('FAIL');
    expect(summary.failures.map((failure) => failure.file)).toEqual([
      '/tests/chmod/00.t',
      '/tests/link/01.t',
    ]);
  });

  it('reports an unfinished run as unknown', () => {
    expect(parseTap('/tests/a/00.t ..\nok 1\n').result).toBe('UNKNOWN');
  });
});

describe('parseCheck', () => {
  it('reads the ran, not run and failure lists', () => {
    const summary = parseCheck(
      'Ran: generic/001 generic/002 generic/003\nNot run: generic/002\nFailures: generic/003\nFailed 1 of 3 tests\n',
    );
    expect(summary.ran).toHaveLength(3);
    expect(summary.notRun).toEqual(['generic/002']);
    expect(summary.failures).toEqual(['generic/003']);
  });

  it('returns empty lists when check printed none', () => {
    expect(parseCheck('Passed all 3 tests\n')).toEqual({ ran: [], notRun: [], failures: [] });
  });
});

describe('limitOf', () => {
  it('names the recorded limit of a failing test file', () => {
    expect(limitOf('/tests/mknod/11.t')?.name).toBe('Device nodes');
    expect(limitOf('/tests/mknod/03.t')?.name).toBe('Device nodes');
  });

  it('leaves every other file unrecorded', () => {
    expect(limitOf('/tests/chmod/00.t')).toBeUndefined();
    expect(limitOf('/tests/xchmod/03.t')).toBeUndefined();
    expect(limitOf('/tests/chmod/03.t')).toBeUndefined();
    expect(limitOf('/tests/truncate/12.t')).toBeUndefined();
  });
});
