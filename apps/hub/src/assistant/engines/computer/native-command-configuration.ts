import {
  ApiError,
  CODEX_COMMAND_CONFIGURATION,
  type AiChatRow,
  type AiNativeCommandWrite,
  type CodexCommandConfiguration,
  type AiNativeCommandReceipt,
} from '@smarteverything/domain';
import type { ComputerRunnerDeps } from './ports';
import type { ProviderState } from './provider-state';
import { authorizeNativeDispatch } from './native-command-admission';
import { CODEX_COMPACT_DEFINITION } from '../../../codex/provider-commands';
import { commandAuthority } from './native-command-authority';
import { canonicalRuntimeInput } from '../../../computers/runtime-receipts';
import { messageOf } from '@smarteverything/logging';
export function nativeCommandConfiguration(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  input: AiNativeCommandWrite,
): CodexCommandConfiguration | undefined {
  if (chat.engine.kind !== 'codex' || input.definition_id === CODEX_COMPACT_DEFINITION)
    return undefined;
  const status = deps.directory.runtimeStatus({
    device_id: input.scope.device_id,
    runtime: 'codex',
  });
  if (status.settings.runtime !== 'codex')
    throw new ApiError('conflict', 'The native configuration belongs to another runtime.');
  const { grant } = commandAuthority(deps, chat, input.scope);
  return CODEX_COMMAND_CONFIGURATION.parse({
    model: chat.engine.model,
    effort: chat.engine.effort,
    options: { ...status.settings.settings.provider.options, ...chat.engine.settings },
    tools: grant.tools,
  });
}
function assertNativeCommandConfiguration(
  deps: ComputerRunnerDeps,
  input: AiNativeCommandWrite,
  expected: CodexCommandConfiguration | undefined,
): void {
  const chat = deps.store.aiChats.chat(input.scope.chat_id);
  if (
    canonicalRuntimeInput(nativeCommandConfiguration(deps, chat, input) ?? null) !==
    canonicalRuntimeInput(expected ?? null)
  )
    throw new ApiError(
      'conflict',
      'The current native model, effort, options or home-tool grants changed during preparation.',
    );
}

export function isManualNativeCommand(input: AiNativeCommandWrite): boolean {
  return input.scope.runtime === 'claude' || input.definition_id !== CODEX_COMPACT_DEFINITION;
}
export async function submitNativeCommand(
  deps: ComputerRunnerDeps,
  state: ProviderState,
  input: AiNativeCommandWrite,
  configuration: CodexCommandConfiguration | undefined,
): Promise<AiNativeCommandReceipt> {
  try {
    return await deps.directory.startRuntimeCommand(
      input,
      (): void => {
        authorizeNativeDispatch(deps, state, input);
        assertNativeCommandConfiguration(deps, input, configuration);
      },
      configuration,
    );
  } catch (cause) {
    return {
      ...deps.store.nativeCommandOperations.read(input.operation_id),
      status: 'unknown',
      text: messageOf(cause).slice(0, 2000),
    };
  }
}
