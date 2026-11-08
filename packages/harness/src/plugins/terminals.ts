import type { Context } from '@deepseek-ai/cordis';
import { harnessPlatform } from '@smarteverything/domain';
import type { HarnessPlatform } from '@smarteverything/domain';
import Terminals from '@deepseek-ai/dsh-terminal';
import * as ShellBackend from '@deepseek-ai/dsh-terminal-bash';
import * as TerminalTools from '@deepseek-ai/dsh-tool-terminal';
import { HOST_PLATFORM } from '../host/host-platforms';

export const name = 'terminals';

export const TERMINAL_TOOL_NAMES = [
  'terminal_open',
  'terminal_send',
  'terminal_read',
  'terminal_signal',
  'terminal_close',
  'terminal_list',
] as const;

export async function mountTerminals(ctx: Context, platform: HarnessPlatform): Promise<void> {
  await ctx.plugin(Terminals);
  await ctx.plugin(ShellBackend, { shellDialect: HOST_PLATFORM[platform].shell });
  await ctx.plugin(TerminalTools);
}

export async function mount(ctx: Context): Promise<void> {
  await mountTerminals(ctx, harnessPlatform(process.platform));
}
