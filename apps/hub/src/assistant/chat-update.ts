import {
  ApiError,
  type AiChatChangeRequest,
  type AiChatRow,
  type Engine,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HarnessService } from '../harness/service';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import type { AssistantDelivery } from './delivery';
import type { Delegation } from './delegation/delegation';
import type { ComputerProviders } from './computer-providers';
import {
  admitHarnessChange,
  closeReplacedHarness,
  codexPermissionChange,
  selectChatEngineChange,
} from './engines/dsh/binding';
import type { EngineRegistry } from './engines/registry';
import type { EngineSelections } from './engine-selections';

import { admitChatEngineChange, admitChatEngineFamily, admitChatExecution } from './native-helpers';

const log = new Logger('hub.assistant');

export interface ChatUpdatePorts {
  readonly chats: ChatDirectory;
  readonly engines: EngineRegistry;
  readonly delivery: AssistantDelivery;
  readonly delegation: Delegation;
  readonly computerProviders: ComputerProviders;
  readonly selections: EngineSelections | null;
  readonly harness: HarnessService | null;
}

export async function updateChat(
  ports: ChatUpdatePorts,
  owner: ChatOwner,
  chatId: string,
  change: AiChatChangeRequest,
): Promise<AiChatRow> {
  const { chats, engines, selections } = ports;
  const before = chats.own(owner, chatId);
  admitChatExecution(before);
  if (change.engine !== undefined) admitChatEngineFamily(before, change.engine.kind);
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
  await bindSelectedEngine(ports, owner, before, selected.engine);
  await closeReplacedHarness(engines, owner, before, selected);
  ports.delegation.assertChange(before, selected);
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

async function bindSelectedEngine(
  ports: ChatUpdatePorts,
  owner: ChatOwner,
  before: AiChatRow,
  engine: Engine | undefined,
): Promise<void> {
  if (engine === undefined) return;
  admitChatEngineChange(before, engine);
  if (before.native_admission === 'standalone') ports.chats.validateStandalone(engine, owner);
  else ports.selections?.validate(engine, owner);
  await ports.computerProviders.bindingChanged(before, engine);
}
