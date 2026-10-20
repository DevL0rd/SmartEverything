import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { skipSetupItem, unskipSetupItem } from '../data/use-readiness';
import type { ReadinessEntry, SetupState } from '../model/readiness';

const BADGE: Readonly<Record<SetupState, { readonly label: string; readonly tone: BadgeTone }>> = {
  done: { label: 'Done', tone: 'positive' },
  todo: { label: 'To do', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

function Marker({
  entry,
  next,
}: {
  readonly entry: ReadinessEntry;
  readonly next: boolean;
}): ReactNode {
  if (entry.state === 'done') {
    return (
      <View className="size-10 items-center justify-center rounded-full bg-positive">
        <Icon name="check" size={20} tone="onPrimary" />
      </View>
    );
  }
  if (next) {
    return (
      <View className="size-10 items-center justify-center rounded-full bg-primary">
        <Icon name={entry.item.icon} size={20} tone="onPrimary" />
      </View>
    );
  }
  return (
    <View className="size-10 items-center justify-center rounded-full border-2 border-outline">
      <Icon name={entry.item.icon} size={20} tone="variant" />
    </View>
  );
}

function Actions({
  entry,
  next,
}: {
  readonly entry: ReadinessEntry;
  readonly next: boolean;
}): ReactNode {
  const { item } = entry;
  if (entry.state === 'done') return null;
  return (
    <View className="flex-row flex-wrap gap-2 pl-13">
      <Button label={item.action} variant={next ? 'filled' : 'tonal'} href={item.go} />
      {entry.state === 'skipped' ? (
        <Button
          label="Ask me again"
          variant="text"
          onPress={() => {
            unskipSetupItem(item.id);
          }}
        />
      ) : (
        <Button
          label="Not now"
          variant="text"
          onPress={() => {
            skipSetupItem(item.id);
          }}
        />
      )}
    </View>
  );
}

export function SetupItemCard({
  entry,
  next,
}: {
  readonly entry: ReadinessEntry;
  readonly next: boolean;
}): ReactNode {
  const badge =
    next && entry.state === 'todo'
      ? { label: 'Next', tone: 'primary' as const }
      : BADGE[entry.state];
  return (
    <View
      className={cn(
        'gap-3 rounded-lg px-4 py-3',
        next ? 'border border-primary/40 bg-primary-container/30' : 'bg-surface-2',
      )}
    >
      <View className="flex-row items-start gap-3">
        <Marker entry={entry} next={next} />
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="body-strong" className="min-w-0 flex-1">
              {entry.item.title}
            </Text>
            <Badge label={badge.label} tone={badge.tone} />
          </View>
          <Text variant="footnote" tone="variant">
            {entry.state === 'done' ? entry.item.doneText : entry.item.todoText}
          </Text>
        </View>
      </View>
      <Actions entry={entry} next={next} />
    </View>
  );
}
