import type { AiChatRow } from '@smarteverything/domain';
import type { EngineStatus } from '../engine';
import type { ComputerRunnerDeps } from './ports';
export function computerEngineStatus(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  working: boolean,
): EngineStatus {
  if (chat.engine.kind !== deps.runtime)
    return { state: 'unavailable', reason: 'This chat has a different engine.' };
  const status = deps.directory.runtimeStatus({
    device_id: chat.engine.device_id,
    runtime: deps.runtime,
  });
  const reason = !status.online
    ? 'The selected supplying computer is offline.'
    : !status.settings.settings.provider.enabled
      ? `The ${deps.runtime} provider is disabled on this computer.`
      : status.capabilities.provider_reason;
  return { state: reason !== null ? 'unavailable' : working ? 'working' : 'ready', reason };
}
