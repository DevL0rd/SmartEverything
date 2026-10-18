import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptSession } from '../../src/claude/provider/adopt';
import { ProviderInputError } from '../../src/claude/provider/input';
import { ProviderSessions } from '../../src/claude/provider/sessions';

const CHAT = '0f9a8c1e-7a3b-4d77-8d5e-3b0f6f7a2c10';
const PROFILE = 'a2c8d0aa-52a4-4c87-8c33-0c6e5e3d9b21';
const DESKTOP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('continuing a desktop session', () => {
  let home: string;
  let data: string;
  let folder: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'claude-config-'));
    data = await mkdtemp(join(tmpdir(), 'claude-data-'));
    folder = await mkdtemp(join(tmpdir(), 'claude-folder-'));
    vi.stubEnv('CLAUDE_CONFIG_DIR', home);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all([home, data, folder].map((path) => rm(path, { recursive: true })));
  });

  async function install(): Promise<{ readonly file: string; readonly original: string }> {
    const fixture = await readFile(
      new URL('./fixtures/desktop-session.jsonl', import.meta.url),
      'utf8',
    );
    const cwd = await realpath(folder);
    const project = join(home, 'projects', cwd.replaceAll(/[^a-zA-Z0-9]/gu, '-'));
    await mkdir(project, { recursive: true });
    const file = join(project, `${DESKTOP}.jsonl`);
    const original = fixture.replaceAll('__CWD__', cwd);
    await writeFile(file, original);
    return { file, original };
  }

  function request(): Parameters<typeof adoptSession>[2] {
    return {
      operation: 'provider_adopt',
      session_id: DESKTOP,
      chat_id: CHAT,
      profile_id: PROFILE,
      cwd: folder,
    };
  }

  it('forks the desktop session into a session owned by the app chat and leaves the original untouched', async () => {
    const { file, original } = await install();
    const sessions = new ProviderSessions(data);
    const forkedId = await adoptSession(sessions, data, request());
    expect(forkedId).not.toBe(DESKTOP);
    expect(await readFile(file, 'utf8')).toBe(original);
    const files = await readdir(join(file, '..'));
    expect(files).toContain(`${forkedId}.jsonl`);
    expect(sessions.owns(forkedId, CHAT, PROFILE, folder)).toBe(true);
    expect(sessions.owns(DESKTOP, CHAT, PROFILE, folder)).toBe(false);
  });

  it('refuses a session that is not in the given folder', async () => {
    const sessions = new ProviderSessions(data);
    await expect(adoptSession(sessions, data, request())).rejects.toThrow(ProviderInputError);
  });

  it('refuses a session that already belongs to an app chat', async () => {
    await install();
    const sessions = new ProviderSessions(data);
    await sessions.remember({
      session_id: DESKTOP,
      chat_id: CHAT,
      profile_id: PROFILE,
      cwd: folder,
    });
    await expect(adoptSession(sessions, data, request())).rejects.toThrow('existing owned');
  });

  it('refuses a folder that is not an absolute path', async () => {
    const sessions = new ProviderSessions(data);
    await expect(
      adoptSession(sessions, data, { ...request(), cwd: 'relative/folder' }),
    ).rejects.toThrow('working directory');
  });
});
