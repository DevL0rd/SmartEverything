import { homedir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onEdit, onSnapshot } from './handlers.ts';
import type { Run } from './process.ts';
import type * as processModule from './process.ts';
import { addLines, agentFile, isAgentSession, removeSession } from './state.ts';
import { onStop } from './stop.ts';

const EDITED = 'tooling/claude-hook/input.ts';
const CHECKOUTS = `${homedir()}/Github/SmartEverything-work`;

const mocks = vi.hoisted(() => ({
  tool: vi.fn<(name: string) => Promise<Run>>(),
  tsc: vi.fn<() => Promise<Run>>(),
}));

vi.mock('./process.ts', async (): Promise<typeof processModule> => ({
  ...(await vi.importActual<typeof processModule>('./process.ts')),
  runTool: (name: string): Promise<Run> => mocks.tool(name),
  projectsTsc: mocks.tsc,
}));

vi.mock('./tests.ts', () => ({ relatedTests: (): Promise<null> => Promise.resolve(null) }));

const clean: Run = { code: 0, timedOut: false, stdout: '', stderr: '', detail: '' };

let session = '';

function names(): string[] {
  return mocks.tool.mock.calls.map(([name]) => name);
}

beforeEach(() => {
  session = `hook-agent-${String(process.pid)}-${String(Date.now())}`;
  mocks.tool.mockReset();
  mocks.tool.mockResolvedValue(clean);
  mocks.tsc.mockReset();
  mocks.tsc.mockResolvedValue(clean);
  vi.stubEnv('CLAUDE_PROJECT_DIR', '/home/user/Github/SmartEverything');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeSession(session);
});

describe('agent session detection', () => {
  it('treats a payload with an agent id as an agent', () => {
    expect(isAgentSession({ session_id: session, agent_id: 'abc123' })).toBe(true);
  });

  it('treats a project inside the private checkouts as an agent', () => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', `${CHECKOUTS}/task`);
    expect(isAgentSession({ session_id: session })).toBe(true);
  });

  it('treats the owner interactive session as not an agent', () => {
    expect(isAgentSession({ session_id: session })).toBe(false);
  });
});

describe('agent edit hook', () => {
  it('runs only prettier and cspell', async () => {
    const payload = { session_id: session, agent_id: 'abc', tool_input: { file_path: EDITED } };
    expect(await onEdit(payload)).toBe(0);
    expect(names().sort()).toEqual(['cspell', 'prettier']);
  });

  it('runs only prettier and cspell in a private checkout', async () => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', `${CHECKOUTS}/task`);
    await onEdit({ session_id: session, tool_input: { file_path: EDITED } });
    expect(names().sort()).toEqual(['cspell', 'prettier']);
  });

  it('runs eslint, prettier, cspell and tsc for an interactive session', async () => {
    await onEdit({ session_id: session, tool_input: { file_path: EDITED } });
    expect(names().sort()).toEqual(['cspell', 'eslint', 'prettier', 'tsc']);
  });
});

describe('agent snapshot and stop hooks', () => {
  it('takes no type snapshot for an agent edit', async () => {
    const payload = {
      session_id: session,
      agent_id: 'abc',
      tool_name: 'Edit',
      tool_input: { file_path: EDITED },
    };
    expect(await onSnapshot(payload)).toBe(0);
    expect(mocks.tsc).not.toHaveBeenCalled();
  });

  it('takes a type snapshot for an interactive edit', async () => {
    const payload = { session_id: session, tool_name: 'Edit', tool_input: { file_path: EDITED } };
    await onSnapshot(payload);
    expect(mocks.tsc).toHaveBeenCalledTimes(1);
  });

  it('never type checks when an agent stops', async () => {
    await addLines(agentFile(session, 'abc', 'edited'), [EDITED]);
    expect(await onStop({ session_id: session, agent_id: 'abc' })).toBe(0);
    expect(mocks.tsc).not.toHaveBeenCalled();
  });

  it('type checks when an interactive session stops', async () => {
    await addLines(agentFile(session, 'main', 'edited'), [EDITED]);
    await onStop({ session_id: session });
    expect(mocks.tsc).toHaveBeenCalledTimes(1);
  });
});
