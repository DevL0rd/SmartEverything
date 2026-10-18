import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClaudeSession } from '@smarteverything/domain';
import { ownedSessions } from '../../src/claude/provider/owned-sessions';
import { ProviderSessions } from '../../src/claude/provider/sessions';

const CHAT = '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10';
const PROFILE = 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21';
const OWNED = '11111111-1111-4111-8111-111111111111';
const DESKTOP = '22222222-2222-4222-8222-222222222222';
const PROBE = '33333333-3333-4333-8333-333333333333';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function session(id: string, cwd: string | null): Pick<ClaudeSession, 'id' | 'cwd'> {
  return { id, cwd };
}

describe('sessions owned by the hub', () => {
  it('hides remembered app sessions and the provider work folder, and shows real Desktop sessions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'owned-sessions-'));
    cleanup.push(directory);
    const sessions = new ProviderSessions(directory);
    await sessions.remember({
      session_id: OWNED,
      chat_id: CHAT,
      profile_id: PROFILE,
      cwd: '/work',
    });

    const owned = ownedSessions(sessions, directory);
    await owned.settled();

    expect(owned.owns(session(OWNED, '/work'))).toBe(true);
    expect(owned.owns(session(PROBE, join(directory, 'provider-work')))).toBe(true);
    expect(owned.owns(session(PROBE, join(directory, 'provider-work', 'nested')))).toBe(true);
    expect(owned.owns(session(DESKTOP, '/work'))).toBe(false);
    expect(owned.owns(session(DESKTOP, join(directory, 'provider-work-other')))).toBe(false);
    expect(owned.owns(session(DESKTOP, null))).toBe(false);
  });
});
