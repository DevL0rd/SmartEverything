import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FixedReference } from '@smarteverything/flow/extract/boundary';
import { Switch } from '../../../../components/switch';
import { Text } from '../../../../components/text';
import { fixedId } from './dialog-model';
import { REF_WORDS, type TitleOf } from './plain-reference';

export function fixedLine(item: FixedReference, titleOf: TitleOf): string {
  return `${titleOf(item.key)} › ${item.port}`;
}

export function FixedRefs({
  fixed,
  titleOf,
  expose,
  onToggle,
}: {
  readonly fixed: readonly FixedReference[];
  readonly titleOf: TitleOf;
  readonly expose: readonly string[];
  readonly onToggle: (id: string, on: boolean) => void;
}): ReactNode {
  if (fixed.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="body-strong" accessibilityRole="header">
        Fixed inside
      </Text>
      <Text variant="footnote" tone="variant">
        These picks stay inside the new node unless you make them an input.
      </Text>
      {fixed.map((item) => (
        <View
          key={fixedId(item)}
          className="min-h-touch-min flex-row items-center justify-between gap-3"
        >
          <View className="flex-1">
            <Text variant="body" numberOfLines={1}>
              {fixedLine(item, titleOf)}
            </Text>
            <Text variant="footnote" tone="variant">
              {REF_WORDS[item.of] ?? 'Fixed pick'}
            </Text>
          </View>
          <Switch
            label={`Make input: ${fixedLine(item, titleOf)}`}
            value={expose.includes(fixedId(item))}
            onChange={(on) => {
              onToggle(fixedId(item), on);
            }}
          />
        </View>
      ))}
    </View>
  );
}
