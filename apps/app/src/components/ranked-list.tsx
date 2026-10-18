import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { View } from 'react-native';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { Section } from './section';
import { Text } from './text';

export interface RankedEntry {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly share: number;
  readonly spoken?: string;
}

export interface RankedListProps {
  readonly title?: string;
  readonly entries: readonly RankedEntry[];
  readonly onPress?: (key: string) => void;
}

const MIN_BAR = 3;

function ShareBar({ share }: { readonly share: number }): ReactNode {
  const filled = Math.min(1, Math.max(0, share));
  const fill = { flexGrow: filled, flexBasis: 0, minWidth: MIN_BAR } as const;
  const rest = { flexGrow: 1 - filled, flexBasis: 0 } as const;
  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="absolute inset-x-4 bottom-1 h-0.75 flex-row rounded-full bg-surface-3"
    >
      <View style={fill} className="rounded-full bg-viz-1 opacity-60" />
      <View style={rest} />
    </View>
  );
}

function RankedRow({
  entry,
  onPress,
}: {
  readonly entry: RankedEntry;
  readonly onPress: RankedListProps['onPress'];
}): ReactNode {
  const spoken = entry.spoken ?? `${entry.label}, ${entry.value}`;
  const content = (
    <>
      <View className="min-w-0 flex-1 pb-1.5">
        <Text variant="callout" ellipsize="middle">
          {entry.label}
        </Text>
      </View>
      <Text variant="callout" tone="variant" className="tabular shrink-0 pb-1.5">
        {entry.value}
      </Text>
      {onPress === undefined ? null : <Icon name="chevronRight" size={16} tone="faint" />}
      <ShareBar share={entry.share} />
    </>
  );
  const frame = 'min-h-row-h flex-row items-center gap-3 px-4 pt-2 pb-2.5';
  if (onPress === undefined) {
    return (
      <View accessible accessibilityLabel={spoken} className={frame}>
        {content}
      </View>
    );
  }
  return (
    <Interactive
      label={spoken}
      onPress={() => {
        onPress(entry.key);
      }}
      className={frame}
    >
      {content}
    </Interactive>
  );
}

export function RankedList({ title, entries, onPress }: RankedListProps): ReactNode {
  return (
    <Section {...(title === undefined ? {} : { title })}>
      <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        {entries.map((entry, index) => (
          <Fragment key={entry.key}>
            {index === 0 ? null : <View className="h-hairline bg-outline-variant" />}
            <RankedRow entry={entry} onPress={onPress} />
          </Fragment>
        ))}
      </View>
    </Section>
  );
}
