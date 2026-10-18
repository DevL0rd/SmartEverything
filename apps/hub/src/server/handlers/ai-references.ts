import { AI_REFERENCE_ENDPOINTS as E } from '@smarteverything/domain';
import type { ReferenceService } from '../../references/service';
import { bound } from '../router';

export const aiReferenceRoutes = (service: ReferenceService) =>
  ({
    searchAiChatReferences: bound(E.searchAiChatReferences, ({ caller, params, body }) =>
      service.search(caller, params.chatId, body),
    ),
  }) as const;
