import {
  ApiError,
  type AiChatRow,
  type AiNativeCommandReceipt,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import { NATIVE_COMMAND_ADAPTERS } from './native-command-adapters';

export class CommandReceipts {
  private readonly running = new Map<string, Set<string>>();

  constructor(private readonly store: Pick<Store, 'host'>) {}

  async save(receipt: AiNativeCommandReceipt): Promise<AiNativeCommandReceipt> {
    const saved = await this.store.host.call('nativeCommandOperations', 'save', receipt);
    this.track(saved);
    return saved;
  }

  track(receipt: AiNativeCommandReceipt): void {
    const chatId = receipt.scope.chat_id;
    const operations = this.running.get(chatId) ?? new Set<string>();
    if (['pending', 'running'].includes(receipt.status)) {
      operations.add(receipt.operation_id);
      this.running.set(chatId, operations);
      return;
    }
    operations.delete(receipt.operation_id);
    if (operations.size === 0) this.running.delete(chatId);
  }

  busy(chatId: string): boolean {
    return this.running.has(chatId);
  }
}

export function availableCommands(status: ComputerRuntimeStatus): boolean {
  return (
    status.online &&
    status.settings.settings.provider.enabled &&
    status.capabilities.provider_reason === null &&
    status.capabilities.operations.includes('provider_start') &&
    NATIVE_COMMAND_ADAPTERS.get(status.runtime)?.capabilities.includes(
      status.capabilities.capability_revision,
    ) === true
  );
}

export function assertOwnReceipt(
  chat: AiChatRow,
  receipt: AiNativeCommandReceipt,
  clientId: string | null,
): void {
  const scope = receipt.scope;
  if (
    scope.chat_id !== chat.id ||
    scope.profile_id !== chat.profile_id ||
    scope.client_id !== clientId ||
    chat.engine.kind !== scope.runtime ||
    chat.engine.device_id !== scope.device_id
  )
    throw new ApiError(
      'forbidden',
      'The native receipt belongs to another owner, client, chat or runtime.',
    );
}
