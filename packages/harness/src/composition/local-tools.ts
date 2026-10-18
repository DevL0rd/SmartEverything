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
import * as SearchTools from '@deepseek-ai/dsh-tool-fs-search';
import * as TodoTool from '@deepseek-ai/dsh-tool-todo';
import PlanMode from '@deepseek-ai/dsh-plan-mode';
import * as ProjectInstructions from '@deepseek-ai/dsh-agent-instructions';
import { mountWebTools } from './web';

const INSTRUCTIONS_MAX_BYTES = 65_536;
const PLAN_GUIDANCE =
  'You are in plan mode. Explore the task with read-only tools, then present the complete plan through exit_plan_mode and wait for the user to approve it before changing anything.';

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

export async function mountLocalTools(ctx: Context, server: boolean): Promise<void> {
  await ctx.plugin(FsObservation);
  await ctx.plugin(FileTools);
  await ctx.plugin(SearchTools, { sampleOverCapGlobResults: false });
  await ctx.plugin(BashTools);
  await ctx.plugin(JobTools);
  await ctx.plugin(QuestionTool);
  await ctx.plugin(TodoTool, { allowParallelInProgress: false });
  await ctx.plugin(PlanMode, { section: PLAN_GUIDANCE });
  await mountWebTools(ctx);
  if (!server) await ctx.plugin(ProjectInstructions, { maxBytes: INSTRUCTIONS_MAX_BYTES });
}
