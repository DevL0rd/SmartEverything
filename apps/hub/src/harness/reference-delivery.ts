import type { AiMessageReference } from '@smarteverything/domain';
import type { ReferenceService } from '../references/service';
import type { HarnessService } from './service';
import type { StoredEvent } from '../store/repositories/assistant-events';
import { harnessReferences } from './reference-runtime';

export function attachHarnessReferences(
  service: HarnessService,
  installed: ReferenceService,
): HarnessService {
  installed.attachNative(['dsh', 'openrouter'], harnessReferences(service));
  return service;
}

export function deliveryReferences(
  service: HarnessService,
  event: StoredEvent,
): readonly AiMessageReference[] {
  if (event.message_id === null) return [];
  return service.store.assistantChat.message(event.message_id).references ?? [];
}
