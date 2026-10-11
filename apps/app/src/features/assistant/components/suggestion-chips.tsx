import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import {
  REPLY_SUGGESTIONS_EMBED,
  type AssistantMessageRow,
  type ReplySuggestionsEmbed,
} from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useDraft } from '../data/drafts';

const PARSED = new WeakMap<object, ReplySuggestionsEmbed | null>();

function parsedSuggestions(embeds: AssistantMessageRow['embeds']): ReplySuggestionsEmbed | null {
  for (const embed of embeds) {
    const parsed = REPLY_SUGGESTIONS_EMBED.safeParse(embed);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function suggestionsOf(row: AssistantMessageRow): ReplySuggestionsEmbed | null {
  const known = PARSED.get(row.embeds);
  if (known !== undefined) {
    return known;
  }
  const found = parsedSuggestions(row.embeds);
  PARSED.set(row.embeds, found);
  return found;
}

export function SuggestionChips({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const [draft, setDraft] = useDraft(row.chat_id);
  const embed = suggestionsOf(row);
  if (embed === null || draft !== '') {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-gutter grow-0"
      contentContainerClassName="gap-2 px-gutter py-1"
    >
      {embed.suggestions.map((suggestion) => (
        <Interactive
          key={suggestion}
          label={suggestion}
          hint="Fills the message field without sending"
          onPress={() => {
            setDraft(suggestion);
          }}
          className="min-h-touch-min flex-row items-center gap-1.5 rounded-full border border-outline px-3.5"
          layerClassName="rounded-full"
        >
          <Icon name="sparkles" size={16} tone="primary" />
          <Text variant="label">{suggestion}</Text>
        </Interactive>
      ))}
    </ScrollView>
  );
}
