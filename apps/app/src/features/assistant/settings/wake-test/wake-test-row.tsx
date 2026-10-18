import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { WakeTestLine, WakeTestVerdict } from '@smarteverything/domain';
import { Badge, type BadgeTone } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { clock } from '../../../../format/time';

const TAGS: Readonly<
  Record<WakeTestVerdict, { readonly label: string; readonly tone: BadgeTone }>
> = {
  matched: { label: 'Matched your name', tone: 'positive' },
  almost: { label: 'Almost', tone: 'warning' },
  heard: { label: 'Heard', tone: 'neutral' },
};

function wordsOf(line: WakeTestLine): string {
  return line.text ?? line.phrase ?? 'Speech that could not be written down';
}

function WordPicker({
  words,
  onAdd,
}: {
  readonly words: readonly string[];
  readonly onAdd: (alias: string) => void;
}): ReactNode {
  if (words.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Tap the word that was meant as the name
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {words.map((word) => (
          <Interactive
            key={word}
            label={`Add ${word} as another name`}
            className="min-h-8 flex-row items-center rounded-full border border-outline bg-surface-2 px-3"
            onPress={() => {
              onAdd(word);
            }}
          >
            <Text variant="footnote">{word}</Text>
          </Interactive>
        ))}
      </View>
    </View>
  );
}

export function WakeTestRow({
  line,
  alias,
  words,
  onAdd,
}: {
  readonly line: WakeTestLine;
  readonly alias: string | null;
  readonly words: readonly string[];
  readonly onAdd: (alias: string) => void;
}): ReactNode {
  const tag = TAGS[line.verdict];
  return (
    <View className="gap-2 border-t border-outline-variant py-3 first:border-t-0">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={tag.label} tone={tag.tone} />
        <Text variant="caption" tone="variant" className="flex-1" numberOfLines={1}>
          {`${line.source} · ${clock(line.at)}`}
        </Text>
      </View>
      <Text variant="body">{wordsOf(line)}</Text>
      {line.phrase === null ? null : (
        <Text variant="footnote" tone="variant">
          {`Wake phrase: ${line.phrase}`}
        </Text>
      )}
      {line.verdict === 'matched' ? null : <WordPicker words={words} onAdd={onAdd} />}
      {alias === null || line.verdict === 'matched' ? null : (
        <View className="flex-row items-center gap-3">
          <Button
            label="Add as alias"
            variant="tonal"
            icon="plus"
            hint={`Makes “${alias}” another name it answers to`}
            onPress={() => {
              onAdd(alias);
            }}
          />
          <Text variant="footnote" tone="variant" className="flex-1" numberOfLines={1}>
            {`as “${alias}”`}
          </Text>
        </View>
      )}
    </View>
  );
}
