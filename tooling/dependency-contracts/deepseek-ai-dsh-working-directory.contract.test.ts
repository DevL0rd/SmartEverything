import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import FileSystem from '@deepseek-ai/dsh-fs-local';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjection from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';

async function projectedDirectory(cwd: string): Promise<unknown> {
  const ctx = new Context();
  await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjection);
  await ctx.plugin(SystemPrompt, { personaPrefix: '' });
  await ctx.plugin(FileSystem);
  await ctx.plugin(WorkingDirectory, { defaultDirectory: '/tmp' });
  const session = ctx.get('sessions')?.create(SessionId('chat'), { meta: { cwd } });
  if (session === undefined) throw new Error('The session store did not register.');
  return ctx.get('sessionProjections')?.snapshot(session, ['workingDirectory']).values
    .workingDirectory;
}

describe('@deepseek-ai/dsh-working-directory contract', () => {
  it('projects the directory a session was created in', async () => {
    expect(await projectedDirectory('/home/me/project')).toBe('/home/me/project');
  });

  it('projects a Windows directory on this Linux host (patch)', async () => {
    expect(await projectedDirectory('C:\\Users\\me\\project')).toBe('C:\\Users\\me\\project');
  });
});
