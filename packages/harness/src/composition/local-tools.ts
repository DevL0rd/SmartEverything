import type { Context } from '@deepseek-ai/cordis';
import { ProjectFileSystem } from './project-filesystem';
import { ProjectFileScopes, type ProjectFilePort } from './project-files';
import FsSandbox from '@deepseek-ai/dsh-fs-sandbox';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import BashSandbox from '@deepseek-ai/dsh-bash-sandbox';
import * as ShellEnv from '@deepseek-ai/dsh-shell-env';
import Jobs from '@deepseek-ai/dsh-jobs-local';
import LocalAttachments from '@deepseek-ai/dsh-attachment-local';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';
import * as FsObservation from '@deepseek-ai/dsh-fs-observation-policy';
import * as FileTools from '@deepseek-ai/dsh-tool-fs';
import * as BashTools from '@deepseek-ai/dsh-tool-bash';
import * as JobTools from '@deepseek-ai/dsh-tool-jobs';
import { ServerShellExecutor } from './server-shell';
import * as QuestionTool from '@deepseek-ai/dsh-tool-ask-user';

export async function mountLocalServices(
  ctx: Context,
  cwd: string,
  home: string,
  options: { readonly server: boolean; readonly projectFiles?: ProjectFilePort },
): Promise<void> {
  const { server, projectFiles } = options;
  await ctx.plugin(LocalSandbox);
  const runtime = projectFiles === undefined ? ctx : ctx.isolate('fs');
  await runtime.plugin(FsSandbox, { cwd });
  if (projectFiles !== undefined) {
    await runtime.inject(['fs'], async (active: Context): Promise<void> => {
      await ctx.plugin((owner: Context): void => {
        new ProjectFileSystem(owner, active.fs, new ProjectFileScopes(owner), projectFiles);
      });
    });
  }
  if (server) await ctx.plugin(ServerShellExecutor);
  else {
    await ctx.plugin(LocalSubprocess);
    await ctx.plugin(ShellEnv, { dshHome: home });
    await ctx.plugin(BashSandbox);
  }
  await ctx.plugin(Jobs);
  await ctx.plugin(LocalAttachments, { dshHome: home });
  await runtime.plugin(WorkingDirectory, { defaultDirectory: cwd });
}

export async function mountLocalTools(ctx: Context, server: boolean): Promise<void> {
  await ctx.plugin(FsObservation);
  await ctx.plugin(FileTools);
  if (server) {
    await ctx.plugin(QuestionTool);
    return;
  }
  await ctx.plugin(BashTools);
  await ctx.plugin(JobTools);
  await ctx.plugin(QuestionTool);
}
