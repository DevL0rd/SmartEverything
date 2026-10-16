import { harnessReferenceRuntime } from './reference-runtime';
import { ApiError } from '@smarteverything/domain';
import type { AiMessageReference } from '@smarteverything/domain';
import { isDeepStrictEqual } from 'node:util';
import type { ReferenceService } from '../references/service';
import type { HarnessService } from './service';
import type { HarnessGrant } from './grant';
import type { StoredEvent } from '../store/repositories/assistant-events';
import { eventAuthority, validateExecutionAuthority } from '../assistant/execution-authority';
import type { Caller } from '../server/auth';

const references = new WeakMap<HarnessService, ReferenceService>();
export function attachHarnessReferences(
  service: HarnessService,
  installed: ReferenceService,
): HarnessService {
  references.set(service, installed);
  installed.attachRuntime(harnessReferenceRuntime(service));
  return service;
}
function referenceService(service: HarnessService): ReferenceService {
  const installed = references.get(service);
  if (installed === undefined)
    throw new ApiError('conflict', 'Central reference validation is unavailable.');
  return installed;
}
export function referenceEventCaller(service: HarnessService, event: StoredEvent): Caller {
  const authority = eventAuthority(service.store, event);
  validateExecutionAuthority(service.store, authority);
  if (authority.kind === 'service')
    return { kind: 'service', authority, profileId: event.profile_id, chatId: event.chat_id };
  if (authority.client_id === null)
    throw new ApiError('forbidden', 'Reference delivery has no initiating client.');
  return {
    kind: 'client',
    client: service.store.clients.byId(authority.client_id),
    profileId: event.profile_id,
    authority,
    via: 'assistant',
    chatId: event.chat_id,
  };
}
export async function deliveryReferences(
  service: HarnessService,
  event: StoredEvent,
): Promise<readonly AiMessageReference[]> {
  if (event.message_id === null) return [];
  const message = service.store.assistantChat.message(event.message_id);
  const selected = message.references ?? [];
  if (selected.length === 0) return [];
  return referenceService(service).resolve(
    referenceEventCaller(service, event),
    event.chat_id,
    event.text,
    selected,
  );
}
export async function validateNativeReferences(
  service: HarnessService,
  id: string,
  input: {
    readonly deliveryId: string;
    readonly selected: readonly AiMessageReference[];
    readonly signal?: AbortSignal | undefined;
  },
): Promise<void> {
  const { signal, deliveryId, selected } = input;
  signal?.throwIfAborted();
  const grant = service.storage.grant(id);
  const event = service.store.assistantEvents.event(deliveryId);
  const metadata = service.store.dshSessions.stat(id, grant.profile_id);
  if (
    event.message_id === null ||
    event.profile_id !== grant.profile_id ||
    event.chat_id !== metadata?.chat_id ||
    grant.event_id !== deliveryId
  )
    throw new ApiError(
      'forbidden',
      'Native references differ from the canonical initiating delivery.',
    );
  const message = service.store.assistantChat.message(event.message_id);
  if (!isDeepStrictEqual(message.references ?? [], selected))
    throw new ApiError(
      'forbidden',
      'Native reference metadata differs from the canonical initiating message.',
    );
  await referenceService(service).revalidateCentral(
    referenceEventCaller(service, event),
    event.chat_id,
    selected.map((item) => item.reference),
  );
  signal?.throwIfAborted();
  verifyReferenceGrant(service, id, grant);
}
function verifyReferenceGrant(service: HarnessService, id: string, grant: HarnessGrant): void {
  if (!isDeepStrictEqual(grant, service.storage.grant(id)))
    throw new ApiError('forbidden', 'Native reference delivery grant changed during validation.');
}
