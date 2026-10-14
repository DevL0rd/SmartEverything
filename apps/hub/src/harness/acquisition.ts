import { nativeForkSeed } from './forks';
import { randomUUID } from 'node:crypto';
import { ApiError, DSH_SESSION_HEADER } from '@smarteverything/domain';
import type { AiChatRow, AiHarnessHost } from '@smarteverything/domain';
import type { HarnessService } from './service';
import type { DshSessionOpened } from '../store/repositories/dsh-sessions';
export function acquireNative(
  service: HarnessService,
  chat: AiChatRow,
  host: AiHarnessHost,
  location: { readonly id: string; readonly cwd: string; readonly signature: string },
): DshSessionOpened {
  const principal = service.hostPrincipal(chat.profile_id, host);
  const metadata = service.store.dshSessions.stat(location.id, chat.profile_id);
  const retry = retryAcquisition(
    service,
    chat,
    { ...location, exists: metadata !== undefined },
    principal,
  );
  if (retry !== undefined) return retry;
  const input = {
    target: host.target,
    runtime_instance: host.runtime_instance,
    connection_generation: host.connection_generation,
    operation_id: randomUUID(),
    lease_ms: 120_000,
  };
  if (metadata !== undefined && metadata.chat_id !== chat.id)
    throw new ApiError('forbidden', 'Native session reuse requires its original chat identity.');
  if (metadata !== undefined) {
    const request = { ...input, session_id: location.id };
    service.store.harnessRecovery.admitNative(chat.id, location.signature, request);
    return service.store.dshSessions.acquire(request, principal);
  }
  const seed = nativeForkSeed(service.store, chat);
  const request = {
    ...input,
    chat_id: chat.id,
    header: DSH_SESSION_HEADER.parse({
      version: 4,
      id: location.id,
      createdAt: Date.now(),
      cwd: location.cwd,
      isSeeded: seed !== undefined,
      ...(seed === undefined ? {} : { parentSession: seed.parent }),
      ...(chat.kind === 'subagent' ? { origin: 'subagent', delegationDepth: 1 } : {}),
      agentPreset: 'smarteverything',
    }),
    composition: principal.composition,
    inherited_event_count: seed?.inherited ?? 0,
  };
  service.store.harnessRecovery.admitNative(chat.id, location.signature, request);
  return seedOpened(service, chat, service.store.dshSessions.create(request, principal), principal);
}
function retryAcquisition(
  service: HarnessService,
  chat: AiChatRow,
  location: { readonly id: string; readonly signature: string; readonly exists: boolean },
  principal: ReturnType<HarnessService['hostPrincipal']>,
): DshSessionOpened | undefined {
  const prior = service.store.harnessRecovery.nativeAdmission(chat.id);
  if (prior?.signature !== location.signature) return undefined;
  if (location.exists) {
    const writer = service.store.dshSessions.writerState(location.id, chat.profile_id);
    if (
      writer.state !== 'active' ||
      writer.claim === null ||
      Date.parse(writer.claim.expires_at) <= Date.now()
    )
      return undefined;
  }
  const opened =
    'header' in prior.request
      ? service.store.dshSessions.create(prior.request, principal)
      : service.store.dshSessions.acquire(prior.request, principal);
  return seedOpened(service, chat, opened, principal);
}
function seedOpened(
  service: HarnessService,
  chat: AiChatRow,
  opened: DshSessionOpened,
  principal: ReturnType<HarnessService['hostPrincipal']>,
): DshSessionOpened {
  const seed = nativeForkSeed(service.store, chat);
  if (seed !== undefined && opened.metadata.next_seq === 0)
    service.store.dshSessions.append(
      { claim: opened.claim, operation_id: randomUUID(), events: seed.events },
      principal,
    );
  const metadata = service.store.dshSessions.stat(opened.claim.session_id, chat.profile_id);
  if (metadata === undefined)
    throw new ApiError('conflict', 'Native creation lost its authoritative metadata.');
  return { ...opened, metadata };
}
