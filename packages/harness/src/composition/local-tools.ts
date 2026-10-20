import type { Context } from '@deepseek-ai/cordis';
import FsSandbox from '@deepseek-ai/dsh-fs-sandbox';
import LocalSandbox from '@deepseek-ai/dsh-sandbox-local';
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local';
import BashSandbox from '@deepseek-ai/dsh-bash-sandbox';
import PwshSandbox from '@deepseek-ai/dsh-pwsh-sandbox';
import * as ShellEnv from '@deepseek-ai/dsh-shell-env';
import Jobs from '@deepseek-ai/dsh-jobs-local';
import LocalAttachments from '@deepseek-ai/dsh-attachment-local';
import WorkingDirectory from '@deepseek-ai/dsh-working-directory';
import * as FsObservation from '@deepseek-ai/dsh-fs-observation-policy';
import * as FileTools from '@deepseek-ai/dsh-tool-fs';
import * as BashTools from '@deepseek-ai/dsh-tool-bash';
import * as PwshTools from '@deepseek-ai/dsh-tool-pwsh';
import * as JobTools from '@deepseek-ai/dsh-tool-jobs';
import * as QuestionTool from '@deepseek-ai/dsh-tool-ask-user';
import * as SearchTools from '@deepseek-ai/dsh-tool-fs-search';
import * as TodoTool from '@deepseek-ai/dsh-tool-todo';
import PlanMode from '@deepseek-ai/dsh-plan-mode';
import * as ProjectInstructions from '@deepseek-ai/dsh-agent-instructions';
import { mountWebTools } from './web';
import { HOST_PLATFORM, type ShellKind } from '../host/host-platforms';
import type { HarnessPlatform } from '@smarteverything/domain';

const INSTRUCTIONS_MAX_BYTES = 65_536;
const PLAN_GUIDANCE =
  'You are in plan mode. Explore the task with read-only tools, then present the complete plan through exit_plan_mode and wait for the user to approve it before changing anything.';

interface ShellMount {
  readonly executor: (ctx: Context) => Promise<void>;
  readonly tool: (ctx: Context) => Promise<void>;
}

const SHELLS: Readonly<Record<ShellKind, ShellMount>> = {
  bash: {
    executor: async (ctx): Promise<void> => {
      await ctx.plugin(BashSandbox);
    },
    tool: async (ctx): Promise<void> => {
      await ctx.plugin(BashTools);
    },
  },
  pwsh: {
    executor: async (ctx): Promise<void> => {
      await ctx.plugin(PwshSandbox);
    },
    tool: async (ctx): Promise<void> => {
      await ctx.plugin(PwshTools);
    },
  },
};

export async function mountLocalServices(
  ctx: Context,
  cwd: string,
  home: string,
  platform: HarnessPlatform,
): Promise<void> {
  await ctx.plugin(LocalSandbox);
  await ctx.plugin(FsSandbox, { cwd });
  await ctx.plugin(LocalSubprocess);
  await ctx.plugin(ShellEnv, { dshHome: home });
  await SHELLS[HOST_PLATFORM[platform].shell].executor(ctx);
  await ctx.plugin(Jobs);
  await ctx.plugin(LocalAttachments, { dshHome: home });
  await ctx.plugin(WorkingDirectory, { defaultDirectory: cwd });
}

export async function mountLocalTools(
  ctx: Context,
  server: boolean,
  platform: HarnessPlatform,
): Promise<void> {
  await ctx.plugin(FsObservation);
  await ctx.plugin(FileTools);
  await ctx.plugin(SearchTools, { sampleOverCapGlobResults: false });
  await SHELLS[HOST_PLATFORM[platform].shell].tool(ctx);
  await ctx.plugin(JobTools);
  await ctx.plugin(QuestionTool);
  await ctx.plugin(TodoTool, { allowParallelInProgress: false });
  await ctx.plugin(PlanMode, { section: PLAN_GUIDANCE });
  await mountWebTools(ctx);
  if (!server) await ctx.plugin(ProjectInstructions, { maxBytes: INSTRUCTIONS_MAX_BYTES });
}
