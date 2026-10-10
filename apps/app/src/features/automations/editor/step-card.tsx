import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';

export interface StepMoves {
  readonly up: (() => void) | null;
  readonly down: (() => void) | null;
}

export function movesOf(index: number, count: number, move: (by: -1 | 1) => void): StepMoves {
  return {
    up:
      index === 0
        ? null
        : (): void => {
            move(-1);
          },
    down:
      index === count - 1
        ? null
        : (): void => {
            move(1);
          },
  };
}

function Moves({ moves, name }: { readonly moves: StepMoves; readonly name: string }): ReactNode {
  return (
    <>
      <IconButton
        icon="chevronUp"
        label={`Move ${name} earlier`}
        disabled={moves.up === null}
        onPress={() => moves.up?.()}
      />
      <IconButton
        icon="chevronDown"
        label={`Move ${name} later`}
        disabled={moves.down === null}
        onPress={() => moves.down?.()}
      />
    </>
  );
}

export function StepCard({
  icon,
  kind,
  summary,
  onRemove,
  moves,
  children,
}: {
  readonly icon: IconName;
  readonly kind: string;
  readonly summary: string;
  readonly onRemove: () => void;
  readonly moves?: StepMoves | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-primary-container">
          <Icon name={icon} size={20} tone="primary" />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="footnote" tone="variant">
            {kind}
          </Text>
          <Text variant="body-strong" numberOfLines={2}>
            {summary}
          </Text>
        </View>
        {moves === undefined || moves === null ? null : <Moves moves={moves} name={kind} />}
        <IconButton icon="close" label={`Remove ${kind}`} onPress={onRemove} />
      </View>
      {children}
    </Card>
  );
}

export function BlockProblems({ problems }: { readonly problems: readonly string[] }): ReactNode {
  if (problems.length === 0) {
    return null;
  }
  return (
    <View accessibilityLiveRegion="polite" className="gap-1 px-4">
      {problems.map((problem) => (
        <View key={problem} className="flex-row items-start gap-2">
          <Icon name="alert" size={16} tone="critical" />
          <Text variant="callout" tone="critical" className="flex-1">
            {problem}
          </Text>
        </View>
      ))}
    </View>
  );
}
