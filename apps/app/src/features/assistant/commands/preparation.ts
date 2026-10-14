import { CancelledError, useQuery } from '@tanstack/react-query';
import {
  AI_HARNESS_ENDPOINTS as E,
  type AiChatRow,
  type AiHarnessSession,
} from '@smarteverything/domain';
import type { api } from '../../../api/transport';
import {
  captureAssistantWrite,
  assertAssistantWriteCurrent,
} from '../../../store/assistant-response-style';
import { useEntityStore } from '../../../store/store-context';
import { useActiveProfile } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { useHarnessSupported } from '../data/harness';

const pending = new WeakMap<ReturnType<typeof api>, Map<string, Promise<void>>>();
export function useCommandPreparation(
  chat: AiChatRow | undefined,
  opened: boolean,
  connectionId: string,
): ReturnType<typeof useQuery<AiHarnessSession>> {
  const store = useEntityStore();
  const profile = useActiveProfile();
  const live = useSyncStatus().status === 'live';
  const supported = useHarnessSupported();
  const own = ownChat(chat);
  const engine = chat?.engine;
  const selection = engine?.kind === 'dsh' ? { ...engine, session_id: null } : engine;
  return useQuery({
    queryKey: ['window', 'ai-command-preparation', connectionId, profile?.id, chat?.id, selection],
    enabled: opened && own && live && supported,
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      if (chat === undefined) throw new CancelledError({ silent: true });
      assertReadActive(signal);
      const authority = captureAssistantWrite(store);
      assertAssistantWriteCurrent(authority);
      await prepareSession(authority.client, chat);
      assertAssistantWriteCurrent(authority);
      assertReadActive(signal);
      const session = await authority.client.call(E.readAiChatHarness, {
        params: { chatId: chat.id },
      });
      assertAssistantWriteCurrent(authority);
      assertReadActive(signal);
      return session;
    },
  });
}
async function prepareSession(client: ReturnType<typeof api>, chat: AiChatRow): Promise<void> {
  const requests = pending.get(client) ?? new Map<string, Promise<void>>();
  pending.set(client, requests);
  const previous = requests.get(chat.id);
  if (previous !== undefined) return previous;
  if (chat.engine.kind === 'dsh' && chat.engine.session_id !== null) return;
  const request = client
    .call(E.openAiChatHarness, { params: { chatId: chat.id } })
    .then(() => undefined);
  requests.set(chat.id, request);
  try {
    await request;
  } finally {
    if (requests.get(chat.id) === request) requests.delete(chat.id);
  }
}

function ownChat(chat: AiChatRow | undefined): boolean {
  return chat?.engine.kind === 'dsh' || chat?.engine.kind === 'openrouter';
}
function assertReadActive(signal: AbortSignal): void {
  if (signal.aborted) throw new CancelledError({ silent: true });
}
