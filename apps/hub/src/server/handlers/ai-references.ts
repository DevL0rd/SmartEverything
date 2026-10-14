import { AI_REFERENCE_ENDPOINTS as E } from '@smarteverything/domain';
import type { ReferenceService } from '../../references/service';
import { bound, type Bound } from '../router';

export function aiReferenceRoutes(service: ReferenceService): Record<keyof typeof E, Bound> {
  return {
    searchAiChatReferences: bound(E.searchAiChatReferences, ({ caller, params, body }) =>
      service.search(caller, params.chatId, body),
    ),
  };
}
