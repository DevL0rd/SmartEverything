import type { Context } from '@deepseek-ai/cordis';
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
import * as QuestionTool from '@deepseek-ai/dsh-tool-ask-user';

export async function mountLocalServices(ctx: Context, cwd: string, home: string): Promise<void> {
  await ctx.plugin(LocalSandbox);
  await ctx.plugin(FsSandbox, { cwd });
  await ctx.plugin(LocalSubprocess);
  await ctx.plugin(ShellEnv, { dshHome: home });
  await ctx.plugin(BashSandbox);
  await ctx.plugin(Jobs);
  await ctx.plugin(LocalAttachments, { dshHome: home });
  await ctx.plugin(WorkingDirectory, { defaultDirectory: cwd });
}

export async function mountLocalTools(ctx: Context): Promise<void> {
  await ctx.plugin(FsObservation);
  await ctx.plugin(FileTools);
  await ctx.plugin(BashTools);
  await ctx.plugin(JobTools);
  await ctx.plugin(QuestionTool);
}
