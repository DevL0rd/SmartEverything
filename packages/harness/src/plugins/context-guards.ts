import type { Context } from '@deepseek-ai/cordis';
import * as RepeatToolReminder from '@deepseek-ai/dsh-repeat-tool-reminder';
import SpillLocal from '@deepseek-ai/dsh-spill-local';
import * as ToolCallTimeoutPolicy from '@deepseek-ai/dsh-tool-call-timeout-policy';

export const name = 'context-guards';

export async function mount(ctx: Context): Promise<void> {
  await ctx.plugin(RepeatToolReminder);
  await ctx.plugin(ToolCallTimeoutPolicy);
  await ctx.plugin(SpillLocal);
}
