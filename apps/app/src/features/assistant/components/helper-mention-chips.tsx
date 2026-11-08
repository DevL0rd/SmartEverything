import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { Icon } from '../../../components/icon';
import type { HelperMention } from '../model/helper-target';
import { ComposerChip } from './composer-chip';

export function HelperMentionChips({
  mentions,
  remove,
}: {
  readonly mentions: readonly HelperMention[];
  readonly remove: (item: HelperMention) => void;
}): ReactNode {
  if (mentions.length === 0) return null;
  return (
    <ScrollView
      className="max-h-20 shrink-0 grow-0"
      contentContainerClassName="flex-row flex-wrap gap-2"
      keyboardShouldPersistTaps="always"
    >
      {mentions.map((item) => (
        <ComposerChip
          key={`${item.chatId}:${String(item.start)}`}
          leading={<Icon name="sparkles" size={16} />}
          label={`To @${item.name}`}
          removeLabel={`Remove helper @${item.name}`}
          onRemove={(): void => {
            remove(item);
          }}
        />
      ))}
    </ScrollView>
  );
}
