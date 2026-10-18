import { ApiError, type AiChatRow, type DshEngine } from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';

export function admitUnboundEngineChange(
  service: HarnessService,
  owner: ChatOwner,
  before: AiChatRow,
  engine: DshEngine,
): DshEngine {
  if (before.engine.kind === 'dsh' && before.engine.session_id !== null) return engine;
  if (engine.session_id !== null)
    throw new ApiError('forbidden', 'An unopened chat cannot acquire an existing native session.');
  const connection = service.directory.get(engine.execution_target);
  const { host } = connection;
  if (
    host.manifest === null ||
    host.workspace?.available !== true ||
    host.unavailable_reason !== null
  )
    throw new ApiError('conflict', 'The selected execution host is not ready.');
  service.admitTarget(owner, host);
  if (connection.profileId !== undefined && connection.profileId !== owner.profileId)
    throw new ApiError('forbidden', 'The selected host belongs to a different profile.');
  const chat = { ...before, engine };
  service.routes.selected(owner.profileId, service.selection(chat), false);
  return engine;
}
