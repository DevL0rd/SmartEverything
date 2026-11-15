import { useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { DriveSettings } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useMutationState } from '../../../store/mutation';
import { ocrLanguagesAfter, ocrLineOf, ocrShownOf, type OcrChoice } from './ocr-languages';
import { saveDriveSettings } from './page-indexing';

function LanguageRow({
  choice,
  chosen,
  busy,
  onPick,
}: {
  readonly choice: OcrChoice;
  readonly chosen: readonly string[];
  readonly busy: boolean;
  readonly onPick: (next: readonly string[]) => void;
}): ReactNode {
  return (
    <ListRow
      title={choice.name}
      role="checkbox"
      checked={choice.chosen}
      disabled={busy || (choice.chosen && chosen.length === 1)}
      trailing={choice.chosen ? <Icon name="check" size={20} tone="primary" /> : undefined}
      onPress={() => {
        const next = ocrLanguagesAfter(chosen, choice.code, !choice.chosen);
        if (next !== null) onPick(next);
      }}
    />
  );
}

function NoMatch({ query }: { readonly query: string }): ReactNode {
  return (
    <EmptyState
      compact
      icon="globe"
      title={`No language matches ${query.trim()}`}
      body="Try another name, like German or Japanese."
    />
  );
}

export function OcrLanguageSheet({
  settings,
  opener,
  onClose,
}: {
  readonly settings: DriveSettings;
  readonly opener: RefObject<View | null>;
  readonly onClose: () => void;
}): ReactNode {
  const client = useQueryClient();
  const mutation = useMutationState();
  const chosen = settings.ocrLanguages;
  const [query, setQuery] = useState('');
  const [pinned] = useState(() => new Set(chosen));
  const shown = ocrShownOf(chosen, query, pinned);
  const pick = (next: readonly string[]): void => {
    mutation.run(() => saveDriveSettings(client, { ocrLanguages: [...next] }), {
      failure: 'The languages did not change',
      label: 'drive_settings.ocr_languages',
    });
  };
  return (
    <Sheet open onClose={onClose} title="Languages for text in pictures" subpage={{ opener }}>
      <View className="gap-3">
        <Text variant="footnote" tone="variant">
          {ocrLineOf(chosen)}
        </Text>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search languages"
          label="Search languages"
          variant="field"
        />
        {shown.length === pinned.size && query.trim() !== '' ? <NoMatch query={query} /> : null}
        <List inset>
          {shown.map((choice) => (
            <LanguageRow
              key={choice.code}
              choice={choice}
              chosen={chosen}
              busy={mutation.busy}
              onPick={pick}
            />
          ))}
        </List>
      </View>
    </Sheet>
  );
}
