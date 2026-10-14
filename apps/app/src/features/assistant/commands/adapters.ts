import { CHAT_ERROR_MESSAGE } from '../model/turn-notice';
import { CommandBindingError } from './types';
import { randomUUID } from 'expo-crypto';
import { AI_HARNESS_COMMAND_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { executeCommand } from './execute';
import { discoverNativeCommands } from './native-adapter';
import { executeNativeCommand } from './native-execution';
import type {
  CommandAdapter,
  CommandBinding,
  CommandExecution,
  CommandOutcome,
  DiscoveredCommands,
} from './types';
const adapters: Readonly<Record<'dsh' | 'native', CommandAdapter>> = {
  dsh: { discover: discoverHarnessCommands, execute: executeHarnessCommand },
  native: { discover: discoverNativeCommands, execute: executeNativeCommand },
};
export function commandAdapter(kind: 'dsh' | 'native'): CommandAdapter {
  return adapters[kind];
}
async function discoverHarnessCommands(binding: CommandBinding): Promise<DiscoveredCommands> {
  if (binding.target?.kind !== 'dsh' || binding.chatId === null)
    throw new CommandBindingError(
      'Command discovery requires the exact harness session.',
      'harness session',
      'unbound',
    );
  const scope = binding.target.scope;
  const result = await api().call(E.listAiChatHarnessCommands, {
    params: { chatId: binding.chatId },
    body: scope,
  });
  if (result.session_id !== scope.session_id || result.epoch < scope.expected_epoch)
    throw new CommandBindingError(
      'Command discovery returned another session. Refresh commands.',
      JSON.stringify(scope),
      JSON.stringify([result.session_id, result.epoch]),
    );
  return {
    scope: { kind: 'dsh', value: { session_id: result.session_id, expected_epoch: result.epoch } },
    commands: result.commands.map((command) => ({
      ...command,
      id: command.definitionId ?? command.name,
      aliases: [],
      enabled: true,
      arguments: true,
      unavailableReason: null,
    })),
  };
}
async function executeHarnessCommand(input: CommandExecution): Promise<CommandOutcome> {
  if (input.scope.kind !== 'dsh')
    throw new CommandBindingError(
      'The harness command has a different runtime binding.',
      'dsh',
      input.scope.kind,
    );
  const outcome = await executeCommand(
    input.chatId,
    input.scopeKey,
    {
      ...input.scope.value,
      operation_id: randomUUID(),
      line: input.line,
      attachments: input.attachments,
    },
    input.authority,
  );
  if (outcome.status !== 'settled') return { status: outcome.status, text: CHAT_ERROR_MESSAGE };
  return {
    status: 'settled',
    completion: outcome.execution.result.kind === 'success' ? 'complete' : 'not run',
    text: outcome.execution.result.text ?? 'Command completed.',
  };
}
