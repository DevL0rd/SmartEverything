import { useEffect } from 'react';
import { CancelledError, useQuery } from '@tanstack/react-query';
import {
  AI_CHAT_AREA_ENDPOINTS as E,
  NEW_CHAT_TITLE,
  type AiChatRow,
  type Engine,
} from '@smarteverything/domain';
import { useEntityStore } from '../../../store/store-context';
import {
  captureAssistantWrite,
  assertAssistantWriteCurrent,
} from '../../../store/assistant-response-style';
import { usePickerSession } from '../picker/model-search-session';
import { useDraft, moveDraft } from '../data/drafts';
import { requestsReferences } from '../references/intent';
import { commandIntent } from '../commands/intent';
import { CHAT_ERROR_MESSAGE } from '../model/turn-notice';

export function useDraftCommands(
  draftKey: string,
  engine: Engine | null,
  ready: boolean,
  actions: { readonly resolve: () => Engine | null; readonly opened: (chatId: string) => void },
): string | null {
  const store = useEntityStore();
  const session = usePickerSession();
  const [text] = useDraft(draftKey);
  const requested = commandIntent(text).kind !== 'text' || requestsReferences(text);
  const own = engine?.kind === 'dsh' || engine?.kind === 'openrouter';
  const query = useQuery({
    queryKey: ['window', 'ai-draft-commands', session.key, draftKey, engine],
    enabled: requested && own && ready && session.ready,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<AiChatRow> => {
      const authority = captureAssistantWrite(store);
      assertAssistantWriteCurrent(authority);
      const selected = actions.resolve();
      if (selected === null || signal.aborted) throw new CancelledError({ silent: true });
      const chat = await authority.client.call(E.createAiChat, {
        body: { title: NEW_CHAT_TITLE, engine: selected },
      });
      assertAssistantWriteCurrent(authority);
      assertReadActive(signal);
      return chat;
    },
  });
  useEffect(() => {
    if (!requested || !session.valid() || query.data === undefined) return;
    moveDraft(draftKey, query.data.id);
    actions.opened(query.data.id);
  }, [requested, session, query.data, draftKey, actions]);
  return requested && query.error !== null ? CHAT_ERROR_MESSAGE : null;
}

function assertReadActive(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelledError({ silent: true });
}
