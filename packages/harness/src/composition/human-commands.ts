import { ManualCompactionError } from '@deepseek-ai/dsh-compaction';
import type { Context } from '@deepseek-ai/cordis';
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands';
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands';

export const name = 'smarteverything-human-commands';
export const inject = ['commands', 'compaction'] as const;

export function apply(ctx: Context): void {
  ctx.commands.register({
    definitionId: CommandDefinitionId('smarteverything.help'),
    name: 'help',
    description: 'List the commands available to this conversation.',
    handler: ({ agent, rawInput }): CommandResult => {
      if (rawInput.trim().length > 0)
        return { kind: 'error', text: '/help does not accept input.' };
      const text = ctx.commands
        .list(agent)
        .map((command) => {
          const hint = command.input === undefined ? '' : ` ${command.input.hint}`;
          const attachments = command.input?.attachments === true ? ' (accepts attachments)' : '';
          return `/${command.name}${hint} — ${command.description}${attachments}`;
        })
        .join('\n');
      return { kind: 'success', text };
    },
  });
  ctx.commands.register({
    definitionId: CommandDefinitionId('smarteverything.compact'),
    name: 'compact',
    description: 'Compact useful conversation history using the current model.',
    handler: (invocation): Promise<CommandResult> => compact(ctx, invocation),
  });
}

async function compact(ctx: Context, invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim().length > 0)
    return { kind: 'error', text: '/compact does not accept input.' };
  const result = await ctx.compaction
    .compactNow(invocation.agent, invocation.signal, invocation.commandId)
    .catch((cause: unknown) => {
      if (cause instanceof ManualCompactionError && cause.code === 'busy') return cause;
      throw cause;
    });
  if (result instanceof ManualCompactionError) return { kind: 'error', text: result.message };
  if (result === null)
    return { kind: 'success', text: 'No useful history is available to compact.' };
  return {
    kind: 'success',
    text: `Compacted ${String(result.shadowedSeqs.length)} history records (${String(result.shadowedTokenCount)} estimated source tokens).`,
    sourceEventSeq: result.summarySeq,
  };
}
