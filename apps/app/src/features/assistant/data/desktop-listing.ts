import { useMemo } from 'react';
import { useDesktopHistory } from '../../computers';
import { useIsOwner } from '../../../store/selectors';
import {
  desktopEntriesOf,
  historyFailedOf,
  historyOffOf,
  type HistoryFailure,
  type HistoryOff,
} from '../chats/desktop-sessions';
import type { ChatEntry } from '../chats/chat-entry';
import type { ChatFilter } from '../chats/list-filters';
import { useEngineCatalogue } from '../provider/provider-data';
import { useAiChats } from './chat-store';

export interface DesktopListing {
  readonly entries: readonly ChatEntry[];
  readonly off: readonly HistoryOff[];
  readonly failed: readonly HistoryFailure[];
}

const KEY_SEPARATOR = '\n';

interface ContinuingChat {
  readonly engine: { readonly kind: string; readonly continued_from?: string | undefined };
}

export function continuedKeyOf(chats: readonly ContinuingChat[]): string {
  return chats
    .flatMap((chat) =>
      chat.engine.kind === 'claude' && chat.engine.continued_from !== undefined
        ? [chat.engine.continued_from]
        : [],
    )
    .sort()
    .join(KEY_SEPARATOR);
}

const NONE: DesktopListing = { entries: [], off: [], failed: [] };

export function useDesktopListing(filter: ChatFilter, query: string): DesktopListing {
  const owner = useIsOwner();
  const computers = useEngineCatalogue().data?.computers;
  const targets = useMemo(
    () =>
      (computers ?? [])
        .filter((computer) => computer.runtime === 'claude' && computer.enabled)
        .map((computer) => ({ deviceId: computer.device_id, name: computer.name })),
    [computers],
  );
  const active = filter !== 'archived' && owner;
  const browsing = filter === 'all' && query.trim() === '';
  const history = useDesktopHistory(targets, active);
  const chats = useAiChats();
  const continuedKey = continuedKeyOf(chats);
  const continued = useMemo(() => new Set(continuedKey.split(KEY_SEPARATOR)), [continuedKey]);
  return useMemo(
    () =>
      active
        ? {
            entries: desktopEntriesOf(history, continued),
            off: browsing ? historyOffOf(history) : [],
            failed: browsing ? historyFailedOf(history) : [],
          }
        : NONE,
    [active, browsing, history, continued],
  );
}
