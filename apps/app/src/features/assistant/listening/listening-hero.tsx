import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useAssistantName } from '../data/assistant-data';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Category,
  type Counts,
  type ListeningRow,
  countsOf,
  isListening,
} from './listening-model';

const SEGMENT: Readonly<Record<Category, string>> = {
  listening: 'bg-positive',
  busy: 'bg-info',
  rest: 'bg-on-surface-faint',
  need: 'bg-warning',
  gone: 'border border-on-surface-faint',
};

function growOf(count: number): { readonly flexGrow: number } {
  return { flexGrow: count };
}

function labelOf(category: Category, offline: boolean): string {
  return category === 'gone' && offline ? 'Last known' : CATEGORY_LABELS[category];
}

function present(counts: Counts): readonly Category[] {
  return CATEGORY_ORDER.filter((category) => counts[category] > 0);
}

function SummaryBar({
  counts,
  offline,
}: {
  readonly counts: Counts;
  readonly offline: boolean;
}): ReactNode {
  const shown = present(counts);
  const spoken = shown
    .map((category) => `${String(counts[category])} ${labelOf(category, offline).toLowerCase()}`)
    .join(', ');
  return (
    <View className="gap-2">
      <View
        role="img"
        accessibilityLabel={spoken}
        className="h-3 flex-row gap-0.5 overflow-hidden rounded-full"
      >
        {shown.map((category) => (
          <View
            key={category}
            style={growOf(counts[category])}
            className={cn('min-w-2 rounded-xs', SEGMENT[category])}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {shown.map((category) => (
          <View key={category} className="flex-row items-center gap-1.5">
            <View aria-hidden className={cn('h-2 w-4 rounded-full', SEGMENT[category])} />
            <Text variant="caption" tone="variant">
              {`${String(counts[category])} ${labelOf(category, offline).toLowerCase()}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Headline({
  listening,
  total,
  offline,
}: {
  readonly listening: number;
  readonly total: number;
  readonly offline: boolean;
}): ReactNode {
  if (total === 0) {
    return (
      <Text variant="callout" tone="variant">
        No source listens yet
      </Text>
    );
  }
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text variant="title-1" className="tabular">
        {String(listening)}
      </Text>
      <Text variant="callout" tone="variant">
        {`of ${String(total)} ${total === 1 ? 'source' : 'sources'} ${offline ? 'were listening' : 'listening'}`}
      </Text>
    </View>
  );
}

export function ListeningHero({
  rows,
  offline,
}: {
  readonly rows: readonly ListeningRow[];
  readonly offline: boolean;
}): ReactNode {
  const name = useAssistantName();
  const counts = countsOf(rows, offline);
  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <Icon name="mic" size={24} tone="default" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="title-3">
            {'Say “'}
            <Text variant="title-3" tone="primary">
              {name}
            </Text>
            {'” anywhere in a sentence near any device below.'}
          </Text>
          <Text variant="footnote" tone="variant">
            Audio is never stored. Only text is kept, and only where Write down is on.
          </Text>
          <View className="-ml-4 self-start">
            <Button label="Change name" variant="text" href={href.settings.assistant()} />
          </View>
        </View>
      </View>
      <Headline listening={rows.filter(isListening).length} total={rows.length} offline={offline} />
      {rows.length === 0 ? null : <SummaryBar counts={counts} offline={offline} />}
    </Card>
  );
}
