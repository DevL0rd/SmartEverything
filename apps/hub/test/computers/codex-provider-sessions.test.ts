import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CODEX_PROVIDER_TURN, type CodexProviderTurn } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodexSessions, toolSignature } from '../../src/codex/sessions';

const CHAT = '6b6e4f0e-2d6c-4f54-9d3a-0a4a4f5c7d11';
const OTHER = 'd9cffc3f-96b0-4a70-a714-06d2456dbcaf';
const CWD = '/work';
const ROOTS = ['/work-extra'];
const SESSION = 'owned-codex-session';

function turn(sessionId: string | null, jobId: string, message: string): CodexProviderTurn {
  return CODEX_PROVIDER_TURN.parse({
    job_id: jobId,
    device_id: CHAT,
    chat_id: CHAT,
    profile_id: CHAT,
    model: 'gpt-6-luna',
    effort: null,
    session_id: sessionId,
    system: 'Home instructions',
    messages: [{ role: 'user', content: [{ type: 'text', text: message }] }],
    tools: [],
    options: { cwd: CWD },
  });
}

function binding(input: CodexProviderTurn): Parameters<CodexSessions['remember']>[0] {
  return {
    session_id: SESSION,
    chat_id: input.chat_id,
    profile_id: input.profile_id,
    cwd: CWD,
    workspace_roots: [CWD, ...ROOTS],
    tool_signature: toolSignature(input),
  };
}

describe('Codex provider session ownership', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'codex-provider-sessions-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each([false, true])('admits a new turn in the same thread after reload=%s', async (reload) => {
    const sessions = new CodexSessions(directory);
    const first = turn(null, CHAT, 'First message');
    await sessions.checkTurn(first, CWD, ROOTS);
    await sessions.remember(binding(first));

    const store = reload ? new CodexSessions(directory) : sessions;
    const followUp = turn(SESSION, OTHER, 'Second message');
    await store.checkTurn(followUp, CWD, ROOTS);
    await store.remember(binding(followUp));
    expect(store.list(CHAT, CHAT)).toEqual([binding(first)]);
  });

  it.each([
    { chat_id: OTHER },
    { profile_id: OTHER },
    { cwd: '/another-workspace' },
    { workspace_roots: [CWD] },
    { tool_signature: 'different tool grants' },
  ])('rejects a conflicting returned thread %j and keeps the owner usable', async (changed) => {
    const sessions = new CodexSessions(directory);
    const first = binding(turn(null, CHAT, 'First message'));
    await sessions.remember(first);
    await expect(sessions.remember({ ...first, ...changed })).rejects.toThrow(
      'Codex returned a session already bound to different input.',
    );
    await sessions.checkTurn(turn(SESSION, OTHER, 'Second message'), CWD, ROOTS);
    await sessions.remember(first);
    expect(sessions.list(CHAT, CHAT)).toEqual([first]);
  });

  it('requires the stored owner, host and workspace roots before resuming', async () => {
    const sessions = new CodexSessions(directory);
    const otherHost = new CodexSessions(join(directory, 'other-host'));
    const followUp = turn(SESSION, OTHER, 'Second message');
    await sessions.remember(binding(followUp));
    const ownerError = 'Resume must name a Codex provider session owned by this chat';
    await expect(otherHost.checkTurn(followUp, CWD, ROOTS)).rejects.toThrow(ownerError);
    await expect(sessions.checkTurn({ ...followUp, chat_id: OTHER }, CWD, ROOTS)).rejects.toThrow(
      ownerError,
    );
    await expect(sessions.checkTurn(followUp, CWD, [])).rejects.toThrow(
      'different frozen tool grants or workspace roots',
    );
  });
});
