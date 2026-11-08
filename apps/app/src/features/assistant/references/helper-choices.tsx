import type { ReactNode } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { compareText } from '../../../format/text';
import { useIsOwner } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { sameJson } from '../../../store/same-json';
import { SuggestionGroup, SuggestionRow } from '../components/suggestion-rows';
import { helperUnavailable } from '../model/helper-target';

export interface HelperChoice {
  readonly id: string;
  readonly chatId: string;
  readonly name: string;
  readonly title: string;
  readonly reason: string | null;
}

const NO_CHOICES: readonly HelperChoice[] = [];

export function useHelperChoices(
  parent: AiChatRow | undefined,
  query: string | undefined,
): readonly HelperChoice[] {
  const owner = useIsOwner();
  return useStoreSelector(
    (state) => {
      if (parent === undefined || query === undefined) return NO_CHOICES;
      const needle = query.trim().toLowerCase();
      return state.tables.ai_chats.rows
        .flatMap((chat) => {
          const name = chat.helper_name;
          if (
            chat.kind !== 'subagent' ||
            chat.parent_id !== parent.id ||
            chat.profile_id !== parent.profile_id ||
            name === null
          )
            return [];
          if (!name.toLowerCase().includes(needle) && !chat.title.toLowerCase().includes(needle))
            return [];
          return [
            {
              id: `helper:${chat.id}`,
              chatId: chat.id,
              name,
              title: chat.title,
              reason: helperUnavailable(chat, owner),
            },
          ];
        })
        .sort((left, right) => compareText(left.name, right.name));
    },
    sameJson,
    [parent, query, owner],
  );
}

export function HelperRows({
  helpers,
  choose,
}: {
  readonly helpers: readonly HelperChoice[];
  readonly choose: (key: string) => void;
}): ReactNode {
  if (helpers.length === 0) return null;
  return (
    <SuggestionGroup label="Helpers">
      {helpers.map((helper) =>
        helper.reason === null ? (
          <SuggestionRow
            key={helper.id}
            id={helper.id}
            icon="sparkles"
            title={helper.name}
            subtitle={helper.title}
            onChoose={choose}
          />
        ) : (
          <ListRow
            key={helper.id}
            icon="sparkles"
            title={helper.name}
            subtitle={helper.title}
            caption={helper.reason}
          />
        ),
      )}
    </SuggestionGroup>
  );
}
