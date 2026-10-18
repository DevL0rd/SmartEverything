import type { CommandDefinition, CommandResult } from '@deepseek-ai/dsh-commands';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { ClaudeCommandFile } from './claude-plugin-manifest';

const PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}';
const HAS_POSITIONAL = /\$[1-9](?!\d)/u;
const POSITIONAL = /\$([1-9])(?!\d)/gu;

export function pluginCommandDefinition(
  command: ClaudeCommandFile,
  pluginRoot: string,
): CommandDefinition {
  return {
    name: command.name,
    description: command.description,
    ...(command.argumentHint === undefined ? {} : { input: { hint: command.argumentHint } }),
    handler: ({ agent, rawInput }): CommandResult => {
      agent.steer(
        createUserMessage({
          content: [{ type: 'text', text: renderCommandBody(command.body, rawInput, pluginRoot) }],
          source: { kind: 'user' },
        }),
      );
      return { kind: 'success' };
    },
  };
}

function renderCommandBody(body: string, rawInput: string, pluginRoot: string): string {
  const input = rawInput.trim();
  return withArguments(body, input).replaceAll(PLUGIN_ROOT, pluginRoot);
}

function withArguments(body: string, input: string): string {
  if (body.includes('$ARGUMENTS')) return body.replaceAll('$ARGUMENTS', input);
  if (HAS_POSITIONAL.test(body)) {
    const positionals = input === '' ? [] : input.split(/\s+/u);
    return body.replace(
      POSITIONAL,
      (_match, digit: string) => positionals[Number(digit) - 1] ?? '',
    );
  }
  return input === '' ? body : `${body.trimEnd()} ${input}`;
}
