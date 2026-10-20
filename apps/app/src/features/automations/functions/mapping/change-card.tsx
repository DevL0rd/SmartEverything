import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Card } from '../../../../components/card';
import { SelectRow } from '../../../../components/rows';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import type { MappingEntry } from './mapping-model';

export interface ChangeEntryProps {
  readonly entry: MappingEntry;
  readonly answer: string;
  readonly onAnswer: (answer: string) => void;
}

function Answer({ entry, answer, onAnswer }: ChangeEntryProps): ReactNode {
  const { picker } = entry;
  if (picker === null) return null;
  if (picker.kind === 'value') {
    return <TextField label={picker.label} value={answer} onChange={onAnswer} />;
  }
  return (
    <SelectRow title={picker.label} options={picker.options} value={answer} onChange={onAnswer} />
  );
}

function ChangeEntry(props: ChangeEntryProps): ReactNode {
  return (
    <View className="gap-1 border-t border-outline-variant pt-2">
      <Text variant="body-strong">{props.entry.sentence}</Text>
      {props.entry.picker === null ? (
        <Text variant="footnote" tone="variant">
          Nothing to choose. The caller keeps working.
        </Text>
      ) : (
        <Answer {...props} />
      )}
    </View>
  );
}

export interface ChangeCardProps {
  readonly title: string;
  readonly caption: string;
  readonly entries: readonly MappingEntry[];
  readonly answerOf: (entry: MappingEntry) => string;
  readonly onAnswer: (entry: MappingEntry, answer: string) => void;
}

export function ChangeCard({
  title,
  caption,
  entries,
  answerOf,
  onAnswer,
}: ChangeCardProps): ReactNode {
  return (
    <Card title={title} action={<Badge label={caption} tone="neutral" />}>
      <View className="gap-2">
        {entries.map((entry) => (
          <ChangeEntry
            key={entry.key}
            entry={entry}
            answer={answerOf(entry)}
            onAnswer={(answer) => {
              onAnswer(entry, answer);
            }}
          />
        ))}
      </View>
    </Card>
  );
}
