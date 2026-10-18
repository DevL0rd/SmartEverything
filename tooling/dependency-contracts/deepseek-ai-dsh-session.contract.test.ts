import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';

async function sessionsOf(ctx: Context): Promise<SessionStore> {
  await ctx.plugin(SessionStore);
  const sessions = ctx.get('sessions');
  if (sessions === undefined) throw new Error('The session store did not register.');
  return sessions;
}

describe('@deepseek-ai/dsh-session contract', () => {
  it('creates a session whose header keeps a POSIX working directory', async () => {
    const sessions = await sessionsOf(new Context());

    expect(
      sessions.create(SessionId('posix'), { meta: { cwd: '/home/me/project' } }).header.cwd,
    ).toBe('/home/me/project');
  });

  it('keeps a Windows working directory in the header on this Linux host (patch)', async () => {
    const sessions = await sessionsOf(new Context());

    expect(
      sessions.create(SessionId('windows'), { meta: { cwd: 'C:\\Users\\me\\project' } }).header.cwd,
    ).toBe('C:\\Users\\me\\project');
  });

  it('still refuses a working directory that is not absolute on either system', async () => {
    const sessions = await sessionsOf(new Context());

    expect(() => sessions.create(SessionId('relative'), { meta: { cwd: 'project/src' } })).toThrow(
      /must be an absolute path/u,
    );
  });
});
