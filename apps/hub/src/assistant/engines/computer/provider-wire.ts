import { z } from 'zod';
import { CODEX_PROVIDER_EVENT, PROVIDER_EVENT, type AiChatRow } from '@smarteverything/domain';
import type { ComputerRunnerDeps } from './ports';
import type { ComputerEvent } from './provider-state';
import { runtimeValue } from './request';

const INTERRUPT_REPLY = z.strictObject({ interrupted: z.boolean() });

export function publishProviderEvent(
  deps: ComputerRunnerDeps,
  chat: Pick<AiChatRow, 'id' | 'profile_id'>,
  deviceId: string,
  event: ComputerEvent,
): void {
  if (deps.runtime === 'claude') {
    deps.providerNotice(
      {
        type: 'ai_chat_provider',
        chat_id: chat.id,
        device_id: deviceId,
        job_id: event.job_id,
        event: PROVIDER_EVENT.parse(event),
      },
      chat.profile_id,
    );
    return;
  }
  deps.runtimeNotice?.(
    {
      type: 'ai_chat_runtime_provider',
      runtime: 'codex',
      chat_id: chat.id,
      device_id: deviceId,
      profile_id: chat.profile_id,
      job_id: event.job_id,
      event: CODEX_PROVIDER_EVENT.parse(event),
    },
    chat.profile_id,
  );
}

export async function interruptJob(
  deps: ComputerRunnerDeps,
  target: { readonly device_id: string; readonly job_id: string },
): Promise<void> {
  await runtimeValue(
    deps.directory,
    { device_id: target.device_id, runtime: deps.runtime },
    deps.runtime === 'claude'
      ? { runtime: 'claude', request: { operation: 'provider_interrupt', job_id: target.job_id } }
      : { runtime: 'codex', request: { operation: 'provider_interrupt', job_id: target.job_id } },
    INTERRUPT_REPLY,
  );
}

export function failureLifecycle(runtime: string, code: string): 'unknown' | 'unavailable' {
  return runtime === 'codex' && code === 'computer_disconnected' ? 'unknown' : 'unavailable';
}
