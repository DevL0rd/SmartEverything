import { OwnEngineSelections } from '../../../harness/own-selection';
import type { EngineStatus } from '../engine';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type { AiChatRow } from '@smarteverything/domain';
import type { HarnessService } from '../../../harness/service';
import { messageOf } from '@smarteverything/logging';

export function followDisconnectedTurns<T extends { readonly chat: AiChatRow }>(
  service: HarnessService,
  turns: () => Iterable<T>,
  failed: (turn: T) => void,
): void {
  service.directory.onOwnershipLost((loss) => {
    for (const turn of turns()) {
      const binding = service.binding(turn.chat);
      if (binding.session_id !== loss.session_id) continue;
      const claim = service.store.dshSessions.attached(loss.session_id, turn.chat.profile_id);
      if (
        claim?.epoch === loss.epoch &&
        claim.connection_generation === loss.generation &&
        claim.runtime_instance === loss.runtime_instance
      )
        failed(turn);
    }
  });
  service.directory.onOffline((host) => {
    for (const turn of turns()) {
      const binding = service.binding(turn.chat);
      if (
        harnessTargetKey(binding.execution_target) !== harnessTargetKey(host.target) ||
        binding.session_id === null
      )
        continue;
      const grant = service.store.harnessCoordination.grant(binding.session_id);
      if (
        grant?.generation === host.connection_generation &&
        grant.runtime_instance === host.runtime_instance
      )
        failed(turn);
    }
  });
}

export function nativeEngineStatus(
  service: HarnessService,
  chat: AiChatRow,
  working: boolean,
): EngineStatus {
  try {
    const engine = new OwnEngineSelections(service).select(chat.profile_id, chat.engine);
    if (engine.kind !== 'dsh')
      return { state: 'unavailable', reason: 'This chat has a different engine boundary.' };
    const connection = service.directory.get(engine.execution_target);
    if (connection.execute === undefined)
      throw new ApiError(
        'conflict',
        connection.host.unavailable_reason ?? 'Host conversation channel is unavailable.',
      );
    return { state: working ? 'working' : 'ready', reason: null };
  } catch (cause) {
    return {
      state: 'unavailable',
      reason: messageOf(cause),
    };
  }
}
