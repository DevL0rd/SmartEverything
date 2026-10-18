import { describe, expect, it } from 'vitest';
import { CLAUDE_SESSION, type ClaudeSession } from '@smarteverything/domain';
import { listSessions } from '../../src/claude/session-listing';

function session(id: string, change: Partial<ClaudeSession> = {}): ClaudeSession {
  const none = null;
  return CLAUDE_SESSION.parse({
    id,
    desktop_id: none,
    title: id,
    cwd: '/work',
    state: 'stopped',
    last_state: none,
    archived: false,
    model: none,
    permission_mode: 'default',
    entrypoint: none,
    pid: none,
    started_at: none,
    updated_at: '2026-10-18T00:00:00.000Z',
    waiting_prompts: 0,
    context_used: none,
    capabilities: {
      send: none,
      interrupt: none,
      answer_prompts: none,
      set_mode: none,
      set_model: none,
      usage: none,
    },
    ...change,
  });
}

const QUERY = { archived: false, limit: 2 };

describe('listing Claude sessions', () => {
  it('leaves out sessions owned by app chats before it applies the limit', () => {
    const rows = [
      session('own-1', { updated_at: '2026-10-18T03:00:00.000Z' }),
      session('own-2', { updated_at: '2026-10-18T02:00:00.000Z' }),
      session('desktop-1', { updated_at: '2026-10-18T01:00:00.000Z' }),
      session('desktop-2'),
    ];
    const listed = listSessions(rows, QUERY, (row) => row.id.startsWith('own'));
    expect(listed.map((row) => row.id)).toEqual(['desktop-1', 'desktop-2']);
  });

  it('keeps running sessions first and filters by archive flag and state', () => {
    const rows = [
      session('old'),
      session('busy', { state: 'busy', updated_at: '2026-10-17T00:00:00.000Z' }),
      session('gone', { archived: true }),
    ];
    expect(listSessions(rows, QUERY, () => false).map((row) => row.id)).toEqual(['busy', 'old']);
    expect(
      listSessions(rows, { ...QUERY, archived: true }, () => false).map((row) => row.id),
    ).toEqual(['gone']);
    expect(
      listSessions(rows, { ...QUERY, state: 'busy' }, () => false).map((row) => row.id),
    ).toEqual(['busy']);
  });
});
