import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushNotices } from './output.ts';
import type { Run } from './process.ts';
import type * as processModule from './process.ts';
import { removeSession } from './state.ts';
import { failuresOf, relatedTests } from './tests.ts';

const SESSION = `hook-tests-${String(process.pid)}`;
const FILE = 'tooling/claude-hook/tests.ts';

const mocks = vi.hoisted(() => ({ tool: vi.fn<() => Promise<Run>>() }));

vi.mock('./process.ts', async (): Promise<typeof processModule> => ({
  ...(await vi.importActual<typeof processModule>('./process.ts')),
  runTool: mocks.tool,
}));

let stdout = '';

beforeEach(() => {
  stdout = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await removeSession(SESSION);
});

describe('related tests', () => {
  it('skips with a visible notice when the run times out', async () => {
    mocks.tool.mockResolvedValue({
      code: null,
      timedOut: true,
      stdout: '',
      stderr: '',
      detail: '',
    });
    expect(await relatedTests(SESSION, 'main', [FILE])).toBeNull();
    flushNotices();
    expect(stdout).toContain('tests timed out after 240 s');
    expect(stdout).toContain('nothing was checked');
  });

  it('skips with a notice, not a failure, when another vitest run holds the gate', async () => {
    mocks.tool.mockResolvedValue({
      code: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      detail: '',
      skipped: 'another vitest check is running',
    });
    expect(await relatedTests(SESSION, 'main', [FILE])).toBeNull();
    flushNotices();
    expect(stdout).toContain('tests skipped, another vitest check is running');
  });

  it('does not run vitest when no source file was edited', async () => {
    mocks.tool.mockClear();
    expect(await relatedTests(SESSION, 'main', ['package.json'])).toBeNull();
    expect(mocks.tool).not.toHaveBeenCalled();
  });
});

describe('failuresOf', () => {
  const root = new URL('../../', import.meta.url).pathname;

  it('lists failed assertions and files that failed to run', () => {
    const failures = failuresOf({
      testResults: [
        {
          name: `${root}packages/domain/test/a.test.ts`,
          status: 'failed',
          assertionResults: [
            { fullName: 'a works', status: 'passed' },
            { fullName: 'a breaks', status: 'failed', failureMessages: ['expected 1\nreceived 2'] },
          ],
        },
        {
          name: `${root}packages/domain/test/b.test.ts`,
          status: 'failed',
          message: 'Cannot find module x',
          assertionResults: [],
        },
        { name: `${root}packages/domain/test/c.test.ts`, status: 'passed', assertionResults: [] },
      ],
    });
    expect(failures).toEqual([
      'packages/domain/test/a.test.ts > a breaks: expected 1',
      'packages/domain/test/b.test.ts > (file failed to run): Cannot find module x',
    ]);
  });
});
