import { useQuery } from '@tanstack/react-query';
import type { AiChatHit } from '@smarteverything/domain';
import { searchAiChats } from '../../../api/ai';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { chatSearchKey } from '../../../queries/keys';

const SEARCH_DELAY_MS = 250;

const HITS_MAX = 20;

export interface MessageHits {
  readonly hits: readonly AiChatHit[];
  readonly pending: boolean;
}

export function useMessageHits(query: string, archived: boolean): MessageHits {
  const text = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const result = useQuery({
    queryKey: chatSearchKey(text, archived),
    queryFn: () => searchAiChats(text, { archived, limit: HITS_MAX }),
    enabled: text !== '',
  });
  const settled = text === query.trim();
  return {
    hits: settled ? (result.data ?? []).filter((hit) => hit.messageId !== null) : [],
    pending: query.trim() !== '' && (!settled || result.isPending),
  };
}
