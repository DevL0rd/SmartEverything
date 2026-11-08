import type { Context } from '@deepseek-ai/cordis';
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands';
import type { CommandResult } from '@deepseek-ai/dsh-commands';

export const name = 'smarteverything-human-commands';
export const inject = ['commands'] as const;

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
}
