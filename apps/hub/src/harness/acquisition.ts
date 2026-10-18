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
  location: { readonly id: string; readonly cwd: string },
): DshSessionOpened {
  const principal = service.hostPrincipal(chat.profile_id, host);
  const metadata = service.store.dshSessions.stat(location.id, chat.profile_id);
  const attach = {
    target: host.target,
    runtime_instance: host.runtime_instance,
    connection_generation: host.connection_generation,
  };
  if (metadata !== undefined) {
    if (metadata.chat_id !== chat.id)
      throw new ApiError('forbidden', 'Native session reuse requires its original chat identity.');
    return service.store.dshSessions.acquire({ ...attach, session_id: location.id }, principal);
  }
  const seed = nativeForkSeed(service.store, chat);
  const created = service.store.dshSessions.create(
    {
      ...attach,
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
      inherited_event_count: seed?.inherited ?? 0,
    },
    principal,
  );
  return seedOpened(service, created, seed, principal);
}

function seedOpened(
  service: HarnessService,
  opened: DshSessionOpened,
  seed: ReturnType<typeof nativeForkSeed>,
  principal: ReturnType<HarnessService['hostPrincipal']>,
): DshSessionOpened {
  if (seed !== undefined && opened.metadata.next_seq === 0)
    service.store.dshSessions.append(
      { claim: opened.claim, operation_id: randomUUID(), events: seed.events },
      principal,
    );
  const metadata = service.store.dshSessions.stat(
    opened.claim.session_id,
    opened.metadata.profile_id,
  );
  if (metadata === undefined)
    throw new ApiError('conflict', 'Native creation lost its authoritative metadata.');
  return { ...opened, metadata };
}
