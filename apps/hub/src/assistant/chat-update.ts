import { ApiError, type AiChatChange, type AiChatRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HarnessService } from '../harness/service';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import type { AssistantDelivery } from './delivery';
import type { Coordination } from './coordination/asks';
import type { ComputerProviders } from './computer-providers';
import {
  admitHarnessChange,
  closeReplacedHarness,
  codexPermissionChange,
  selectChatEngineChange,
} from './engines/dsh/binding';
import type { EngineRegistry } from './engines/registry';
import type { EngineSelections } from './engine-selections';

const log = new Logger('hub.assistant');

export interface ChatUpdatePorts {
  readonly chats: ChatDirectory;
  readonly engines: EngineRegistry;
  readonly delivery: AssistantDelivery;
  readonly coordination: Coordination;
  readonly computerProviders: ComputerProviders;
  readonly selections: EngineSelections | null;
  readonly harness: HarnessService | null;
}

export async function updateChat(
  ports: ChatUpdatePorts,
  owner: ChatOwner,
  chatId: string,
  change: AiChatChange,
): Promise<AiChatRow> {
  const { chats, engines, selections } = ports;
  const before = chats.own(owner, chatId);
  const selected = selectChatEngineChange(
    { selections, harness: ports.harness, owner },
    before,
    change,
  );
  admitHarnessChange(before, selected);
  const altersScope = selected.engine !== undefined || selected.tools !== undefined;
  if (altersScope) engines.forMutation(before, owner.role);
  const permissionOnly = codexPermissionChange(before, selected);
  if (
    engines.engineOf(before)?.status(before).state === 'working' &&
    altersScope &&
    !permissionOnly
  )
    throw new ApiError(
      'conflict',
      'Stop the running turn before changing its engine or tool scope.',
    );
  if (selected.engine !== undefined) {
    selections?.validate(selected.engine, owner);
    await ports.computerProviders.bindingChanged(before, selected.engine);
  }
  await closeReplacedHarness(engines, owner, before, selected);
  ports.coordination.assertChange(before, selected);
  const chat = chats.update(owner, chatId, selected);
  log.info('chat.updated', {
    chatId,
    profileId: owner.profileId,
    fields: Object.keys(change).join(','),
    engine: selected.engine,
    toolsChanged: selected.tools !== undefined,
  });
  ports.delivery.pump();
  return chat;
}
