import { nativeForkSeed } from './forks';
import { hasModelPolicy, modelPolicyEvents } from './child-routes';
import { randomUUID } from 'node:crypto';
import { ApiError, DSH_SESSION_HEADER } from '@smarteverything/domain';
import { SUBAGENT_MODEL_POLICY_EVENT } from '@smarteverything/harness';
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
    const acquired = service.store.dshSessions.acquire(
      { ...attach, session_id: location.id },
      principal,
    );
    return withModelPolicy(service, acquired, principal);
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
  if (opened.metadata.next_seq === 0) {
    const inherited = seed?.events ?? [];
    const events = hasModelPolicy(inherited)
      ? inherited
      : [...inherited, ...modelPolicyEvents(service, opened.metadata.profile_id, inherited.length)];
    if (events.length > 0)
      service.store.dshSessions.append(
        { claim: opened.claim, operation_id: randomUUID(), events },
        principal,
      );
  }
  return reopened(service, opened);
}

function withModelPolicy(
  service: HarnessService,
  opened: DshSessionOpened,
  principal: ReturnType<HarnessService['hostPrincipal']>,
): DshSessionOpened {
  const { session_id } = opened.claim;
  const { profile_id, next_seq } = opened.metadata;
  if (service.store.dshSessions.recorded(session_id, profile_id, SUBAGENT_MODEL_POLICY_EVENT))
    return opened;
  const events = modelPolicyEvents(service, profile_id, next_seq);
  if (events.length === 0) return opened;
  service.store.dshSessions.append(
    { claim: opened.claim, operation_id: randomUUID(), events },
    principal,
  );
  return reopened(service, opened);
}

function reopened(service: HarnessService, opened: DshSessionOpened): DshSessionOpened {
  const metadata = service.store.dshSessions.stat(
    opened.claim.session_id,
    opened.metadata.profile_id,
  );
  if (metadata === undefined)
    throw new ApiError('conflict', 'Native opening lost its authoritative metadata.');
  return { ...opened, metadata };
}
