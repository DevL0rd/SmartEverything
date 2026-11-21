import {
  AI_CHAT_AREA_ENDPOINTS,
  type AssistantReaction,
  type AssistantReactionChange,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { useRef, useState } from 'react';
import { background } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { usePausable } from '../../../design/external-store';
import { historySynchronization } from './history';
import { acknowledgedReactions, type Acknowledged, type ReactionReceipt } from './reaction-members';
import { useEntityStore } from '../../../store/store-context';
import { api } from '../../../api/transport';

async function setMessageReaction(
  row: Pick<AssistantMessageRow, 'id' | 'chat_id'>,
  change: AssistantReactionChange,
): Promise<ReactionReceipt> {
  let sequence: number | null = null;
  const reactions = await api().call(
    AI_CHAT_AREA_ENDPOINTS.setAiChatMessageReaction,
    {
      params: { chatId: row.chat_id, messageId: row.id },
      body: change,
    },
    {
      onSequence: (seq) => {
        sequence = seq;
      },
    },
  );
  return { sequence, reactions };
}

const NO_PENDING: ReadonlySet<string> = new Set();
const NO_REACTIONS: readonly AssistantReaction[] = [];

function subscribeDormant(): () => void {
  return () => undefined;
}

function membersOf(
  row: AssistantMessageRow,
  acknowledged: Acknowledged | null,
  revision: number,
  store: ReturnType<typeof useEntityStore>,
): readonly AssistantReaction[] {
  if (acknowledged?.revision !== revision) return row.reactions ?? NO_REACTIONS;
  const state = store.get();
  return acknowledgedReactions(
    row,
    acknowledged,
    state.tables.assistant_messages.byId[row.id],
    state.sync.seq,
  );
}

interface ReactionContext {
  readonly row: AssistantMessageRow;
  readonly store: ReturnType<typeof useEntityStore>;
  readonly requests: () => Set<string>;
  readonly setPending: (pending: ReadonlySet<string>) => void;
  readonly setAcknowledged: (next: (last: Acknowledged | null) => Acknowledged | null) => void;
}

async function updateReaction(
  context: ReactionContext,
  emoji: string,
  present: boolean,
): Promise<void> {
  const { row, store, setPending, setAcknowledged } = context;
  if (store.get().session?.client.profile_id !== row.profile_id) return;
  const requests = context.requests();
  if (requests.has(emoji)) return;
  const requestRevision = historySynchronization.get();
  requests.add(emoji);
  setPending(new Set(requests));
  try {
    const receipt = await setMessageReaction(row, { emoji, present });
    setAcknowledged((last) => {
      if (historySynchronization.get() !== requestRevision) return last;
      const previous = last?.revision === requestRevision ? last.receipt.sequence : null;
      if (previous !== null && receipt.sequence !== null && previous > receipt.sequence)
        return last;
      return { row, receipt, revision: requestRevision };
    });
  } catch (error) {
    notifyReactionFailure(present, error, () => {
      background(updateReaction(context, emoji, present), 'message_reactions.retry_failed');
    });
  } finally {
    requests.delete(emoji);
    setPending(new Set(requests));
  }
}

export function useReactionToggle(row: AssistantMessageRow): {
  readonly pending: ReadonlySet<string>;
  readonly members: readonly AssistantReaction[];
  readonly change: (emoji: string, present: boolean) => void;
} {
  const store = useEntityStore();
  const active = useRef<Set<string> | null>(null);
  const [pending, setPending] = useState(NO_PENDING);
  const [acknowledged, setAcknowledged] = useState<Acknowledged | null>(null);
  const revision = usePausable(
    acknowledged === null ? subscribeDormant : historySynchronization.subscribe,
    historySynchronization.get,
  );
  return {
    pending,
    members: membersOf(row, acknowledged, revision, store),
    change: (emoji, present): void => {
      background(
        updateReaction(
          {
            row,
            store,
            requests: () => {
              const requests = active.current ?? new Set<string>();
              active.current = requests;
              return requests;
            },
            setPending,
            setAcknowledged,
          },
          emoji,
          present,
        ),
        'message_reactions.update_failed',
      );
    },
  };
}

function notifyReactionFailure(present: boolean, error: unknown, retry: () => void): void {
  notify({
    message: present ? 'Couldn’t add reaction' : 'Couldn’t remove reaction',
    error,
    tone: 'critical',
    action: { label: 'Retry', onPress: retry },
  });
}
