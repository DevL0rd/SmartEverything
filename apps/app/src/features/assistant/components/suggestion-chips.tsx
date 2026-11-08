import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import {
  REPLY_SUGGESTIONS_EMBED,
  type AssistantMessageRow,
  type ReplySuggestionsEmbed,
} from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { setDraft, useDraftSelected } from '../data/drafts';
import { Rise } from './rise';
import { ROW_RISE } from './thread-motion';

const STAGGER_MS = 40;

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

const isFilled = (text: string): boolean => text !== '';

export function SuggestionChips({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const filled = useDraftSelected(row.chat_id, isFilled);
  const embed = suggestionsOf(row);
  if (embed === null || filled) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-gutter mt-1 grow-0"
      contentContainerClassName="gap-1.5 px-gutter"
    >
      {embed.suggestions.map((suggestion, index) => (
        <Rise key={suggestion} from={ROW_RISE.px} duration={ROW_RISE.ms} delay={index * STAGGER_MS}>
          <Interactive
            label={suggestion}
            hint="Fills the message field without sending"
            onPress={() => {
              setDraft(row.chat_id, suggestion);
            }}
            className="h-7.5 justify-center rounded-full border border-outline px-3"
            layerClassName="rounded-full"
          >
            <Text variant="footnote" numberOfLines={1}>
              {suggestion}
            </Text>
          </Interactive>
        </Rise>
      ))}
    </ScrollView>
  );
}
