import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushNotices } from './output.ts';
import type { Run } from './process.ts';
import type * as processModule from './process.ts';
import { addLines, agentFile, removeSession, writeAtomic } from './state.ts';
import { onStop } from './stop.ts';

const EDITED = 'tooling/claude-hook/input.ts';
const STALE = 'packages/domain/test/api-requests.test.ts';

const mocks = vi.hoisted(() => ({ tsc: vi.fn<() => Promise<Run>>() }));

vi.mock('./process.ts', async (): Promise<typeof processModule> => ({
  ...(await vi.importActual<typeof processModule>('./process.ts')),
  projectsTsc: mocks.tsc,
}));

vi.mock('./tests.ts', () => ({ relatedTests: (): Promise<null> => Promise.resolve(null) }));

function failing(...files: readonly string[]): Run {
  const stdout = files.map((file) => `${file}(1,1): error TS2322: broken\n`).join('');
  return { code: 2, timedOut: false, stdout, stderr: '', detail: '' };
}

let session = '';
let stderr = '';
let stdout = '';

async function stop(extra: Record<string, unknown> = {}): Promise<number> {
  await addLines(agentFile(session, 'main', 'edited'), [EDITED]);
  return onStop({ session_id: session, ...extra });
}

beforeEach(async () => {
  session = `hook-test-${String(process.pid)}-${String(Date.now())}`;
  stderr = '';
  stdout = '';
  mocks.tsc.mockReset();
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  await writeAtomic(agentFile(session, 'main', 'snapshot.json'), JSON.stringify({ counts: {} }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await removeSession(session);
});

describe('stop hook', () => {
  it('reports errors in a file the agent edited', async () => {
    mocks.tsc.mockResolvedValue(failing(EDITED));
    expect(await stop()).toBe(2);
    expect(stderr).toContain(EDITED);
  });

  it('keeps pre-existing errors in other files out of the report', async () => {
    const snapshot = { counts: { [`${STALE}\tTS2322\tbroken`]: 1 } };
    await writeAtomic(agentFile(session, 'main', 'snapshot.json'), JSON.stringify(snapshot));
    mocks.tsc.mockResolvedValue(failing(STALE));
    expect(await stop()).toBe(0);
    expect(stderr).toBe('');
  });

  it('reports a new error elsewhere together with the own error', async () => {
    mocks.tsc.mockResolvedValue(failing(EDITED, STALE));
    expect(await stop()).toBe(2);
    expect(stderr).toContain(EDITED);
    expect(stderr).toContain(STALE);
  });

  it('checks the same files again on the next stop after blocking', async () => {
    mocks.tsc.mockResolvedValue(failing(EDITED));
    expect(await stop()).toBe(2);
    mocks.tsc.mockResolvedValue({ ...failing(), code: 0 });
    expect(await onStop({ session_id: session })).toBe(0);
    expect(mocks.tsc).toHaveBeenCalledTimes(2);
  });

  it('warns instead of blocking again after a retry', async () => {
    mocks.tsc.mockResolvedValue(failing(EDITED));
    expect(await stop({ stop_hook_active: true })).toBe(0);
    flushNotices();
    expect(stderr).toBe('');
    expect(stdout).toContain(
      'still failing after a retry: tsc -b tooling (edited files and new errors)',
    );
  });

  it('does not block or fail when the check was skipped, and retries the files next time', async () => {
    const skipped = { ...failing(), code: null, skipped: 'another tsc check is running' };
    mocks.tsc.mockResolvedValue(skipped);
    expect(await stop()).toBe(0);
    flushNotices();
    expect(stderr).toBe('');
    expect(stdout).toContain('tsc -b tooling skipped, another tsc check is running');
    mocks.tsc.mockResolvedValue(failing(EDITED));
    expect(await onStop({ session_id: session })).toBe(2);
    expect(stderr).toContain(EDITED);
  });

  it('does nothing when no type-relevant file was edited', async () => {
    expect(await onStop({ session_id: session })).toBe(0);
    expect(mocks.tsc).not.toHaveBeenCalled();
  });
});
