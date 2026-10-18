import { CommandBindingError } from './types';
import {
  AI_NATIVE_COMMAND_ENDPOINTS as E,
  type AiNativeCommandScope,
  type AiNativeCommandReceipt,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type {
  CommandBinding,
  DiscoveredCommands,
  CommandOutcome,
  CommandCompletion,
} from './types';
export async function discoverNativeCommands(binding: CommandBinding): Promise<DiscoveredCommands> {
  if (binding.target?.kind !== 'native' || binding.chatId === null)
    throw new CommandBindingError(
      'Commands aren’t ready yet. Try again in a moment.',
      'native session',
      'unbound',
    );
  const catalogue = await api().call(E.listAiChatNativeCommands, {
    params: { chatId: binding.chatId },
  });
  const {
    version: _version,
    connection_generation: _connection,
    catalogue_revision: _catalogue,
    ...expected
  } = catalogue.scope;
  if (nativeScopeKey(expected) !== nativeScopeKey(binding.target.expected))
    throw new CommandBindingError(
      'The commands changed. Refresh commands.',
      nativeScopeKey(binding.target.expected),
      nativeScopeKey(expected),
    );
  return {
    scope: { kind: 'native', value: catalogue.scope },
    commands: catalogue.commands.map((command) => ({
      native: command,
      id: command.definition_id,
      definitionId: command.definition_id,
      name: command.name,
      description: command.description,
      aliases: command.aliases,
      enabled: command.enabled,
      arguments: command.arguments,
      unavailableReason: command.unavailable_reason,
      input: {
        hint:
          command.argument_hint ??
          (command.arguments ? 'Arguments supported.' : 'No arguments accepted.'),
        attachments: command.attachments,
      },
    })),
  };
}
export function nativeScopeKey(
  scope: Omit<AiNativeCommandScope, 'version' | 'connection_generation' | 'catalogue_revision'>,
): string {
  return JSON.stringify([
    scope.profile_id,
    scope.client_id,
    scope.chat_id,
    scope.device_id,
    scope.runtime,
    scope.session_id,
    scope.job_id,
    scope.process_generation,
    scope.cwd,
    scope.capability_revision,
  ]);
}
export function nativeReceiptOutcome(receipt: AiNativeCommandReceipt): CommandOutcome | null {
  if (receipt.status === 'pending' || receipt.status === 'running') return null;
  if (receipt.status !== 'settled')
    return {
      status: receipt.status,
      text: receipt.text ?? 'Couldn’t confirm the command finished. Your draft is kept.',
    };
  if (receipt.outcome === null)
    return {
      status: 'unknown',
      text: receipt.text ?? 'Couldn’t confirm the command ran. Your draft is kept.',
    };
  return {
    status: 'settled',
    completion: nativeCompletion(receipt.outcome),
    text: receipt.text ?? nativeOutcomeText(receipt.outcome),
  };
}
function nativeOutcomeText(outcome: AiNativeCommandReceipt['outcome']): string {
  switch (outcome) {
    case 'completed':
      return 'Done.';
    case 'compacted':
      return 'Chat compacted.';
    case 'no_op':
      return 'The command finished without changing anything. Your draft is kept.';
    case 'interrupted':
      return 'The command was interrupted. Your draft is kept.';
    case 'error':
      return 'The command failed. Your draft is kept.';
    case null:
      return 'Couldn’t confirm the command ran. Your draft is kept.';
  }
}

function nativeCompletion(
  outcome: NonNullable<AiNativeCommandReceipt['outcome']>,
): CommandCompletion {
  switch (outcome) {
    case 'completed':
      return 'complete';
    case 'compacted':
      return 'compacted';
    case 'no_op':
      return 'no change';
    case 'interrupted':
      return 'interrupted';
    case 'error':
      return 'failed';
  }
}
