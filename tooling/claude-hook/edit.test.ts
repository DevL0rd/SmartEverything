import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onEdit } from './handlers.ts';
import type { Run } from './process.ts';
import type * as processModule from './process.ts';
import { agentFile, removeSession, writeAtomic } from './state.ts';

const EDITED = 'tooling/claude-hook/input.ts';
const OTHER = 'packages/domain/src/index.ts';

const mocks = vi.hoisted(() => ({ tool: vi.fn<(name: string) => Promise<Run>>() }));

vi.mock('./process.ts', async (): Promise<typeof processModule> => ({
  ...(await vi.importActual<typeof processModule>('./process.ts')),
  runTool: (name: string): Promise<Run> => mocks.tool(name),
}));

const clean: Run = { code: 0, timedOut: false, stdout: '', stderr: '', detail: '' };

function tsc(...files: readonly string[]): Run {
  const stdout = files.map((file) => `${file}(3,1): error TS2322: broken\n`).join('');
  return { ...clean, code: 2, stdout };
}

let session = '';
let stderr = '';

function edit(): Promise<number> {
  return onEdit({ session_id: session, tool_input: { file_path: EDITED } });
}

beforeEach(async () => {
  session = `hook-edit-${String(process.pid)}-${String(Date.now())}`;
  stderr = '';
  mocks.tool.mockReset();
  mocks.tool.mockResolvedValue(clean);
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const counts = { [`${OTHER}\tTS2322\tbroken`]: 1 };
  await writeAtomic(agentFile(session, 'main', 'snapshot.json'), JSON.stringify({ counts }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await removeSession(session);
});

describe('edit hook', () => {
  it('passes when every check is clean', async () => {
    expect(await edit()).toBe(0);
    expect(stderr).toBe('');
  });

  it('blocks on a type error planted in the edited file', async () => {
    mocks.tool.mockImplementation((name) => Promise.resolve(name === 'tsc' ? tsc(EDITED) : clean));
    expect(await edit()).toBe(2);
    expect(stderr).toContain(`${EDITED} 3:1 TS2322 broken`);
  });

  it('ignores a pre-existing error elsewhere in the workspace', async () => {
    mocks.tool.mockImplementation((name) => Promise.resolve(name === 'tsc' ? tsc(OTHER) : clean));
    expect(await edit()).toBe(0);
    expect(stderr).toBe('');
  });

  it('runs eslint, prettier, cspell and tsc once each', async () => {
    await edit();
    expect(mocks.tool).toHaveBeenCalledWith('tsc');
    expect(mocks.tool).toHaveBeenCalledTimes(4);
  });

  it('reports lint failures from the edit', async () => {
    const failed = { ...clean, code: 1, stdout: 'not json' };
    mocks.tool.mockImplementation((name) => Promise.resolve(name === 'eslint' ? failed : clean));
    expect(await edit()).toBe(2);
    expect(stderr).toContain('eslint');
  });
});
