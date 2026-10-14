import { OwnEngineSelections } from '../../../harness/own-selection';
import type { EngineStatus } from '../engine';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type { AiChatRow, AiHarnessHost, DshWriterClaim } from '@smarteverything/domain';
import type { HarnessDispatcher } from '@smarteverything/harness/process';
import type { HarnessConnection } from '../../../harness/directory';
import type { HarnessService } from '../../../harness/service';

export function nativeSessionReusable(
  service: HarnessService,
  dispatcher: HarnessDispatcher,
  id: string | null,
  profile: string,
): boolean {
  if (id === null) return false;
  const writer = service.store.dshSessions.writerState(id, profile);
  const claim = writer.claim;
  if (writer.state !== 'active' || claim === null || Date.parse(claim.expires_at) <= Date.now())
    return false;
  try {
    const connection = service.directory.get(claim.target);
    if (!boundRuntime(connection.host, claim)) return false;
    return runtimeSessionPresent(connection, dispatcher, id, claim.epoch);
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'conflict') return false;
    throw cause;
  }
}
export function followDisconnectedTurns<T extends { readonly chat: AiChatRow }>(
  service: HarnessService,
  turns: () => Iterable<T>,
  failed: (turn: T) => void,
): void {
  service.directory.onOwnershipLost((loss) => {
    for (const turn of turns()) {
      const binding = service.binding(turn.chat);
      if (binding.session_id !== loss.session_id) continue;
      const claim = service.store.dshSessions.writerState(
        loss.session_id,
        turn.chat.profile_id,
      ).claim;
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

function boundRuntime(host: AiHarnessHost, claim: DshWriterClaim): boolean {
  return (
    host.connection_generation === claim.connection_generation &&
    host.runtime_instance === claim.runtime_instance
  );
}

function runtimeSessionPresent(
  connection: HarnessConnection,
  dispatcher: HarnessDispatcher,
  id: string,
  epoch: number,
): boolean {
  return connection.host.target.kind === 'server'
    ? dispatcher.hasSession(id, epoch)
    : connection.hasSession?.(id, epoch) === true;
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
      reason: cause instanceof Error ? cause.message : 'Execution host unavailable.',
    };
  }
}
