import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Icon, type IconName } from '../../../../components/icon';
import { Section } from '../../../../components/section';
import { Text } from '../../../../components/text';
import type { StatusTone } from '../../../../components/tone';
import type { ProblemGroup, ProblemItem } from './problem-model';

export interface ProblemHandlers {
  readonly onGoTo: (nodeId: string) => void;
  readonly onFix: (findingId: string) => void;
}

const TONE: Readonly<Record<ProblemItem['severity'], StatusTone>> = {
  error: 'critical',
  warning: 'warning',
  hint: 'info',
};

const ICON: Readonly<Record<ProblemItem['severity'], IconName>> = {
  error: 'alert',
  warning: 'warning',
  hint: 'info',
};

function ItemRow({
  item,
  nodeId,
  handlers,
}: {
  readonly item: ProblemItem;
  readonly nodeId: string | null;
  readonly handlers: ProblemHandlers;
}): ReactNode {
  return (
    <View className="gap-2 px-4 py-2">
      <View className="flex-row items-start gap-3">
        <Icon name={ICON[item.severity]} size={20} tone={TONE[item.severity]} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body">{item.message}</Text>
          {item.fix !== undefined && !item.fixable ? (
            <Text variant="footnote" tone="variant">
              {item.fix}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-2 pl-8">
        {item.fixable && item.fix !== undefined ? (
          <Button
            label={item.fix}
            variant="tonal"
            icon="sparkles"
            onPress={() => {
              handlers.onFix(item.id);
            }}
          />
        ) : null}
        {nodeId === null ? null : (
          <Button
            label="Go to"
            variant="text"
            onPress={() => {
              handlers.onGoTo(nodeId);
            }}
          />
        )}
      </View>
    </View>
  );
}

export function ProblemList({
  groups,
  handlers,
}: {
  readonly groups: readonly ProblemGroup[];
  readonly handlers: ProblemHandlers;
}): ReactNode {
  if (groups.length === 0) {
    return (
      <View className="items-center gap-2 px-4 py-8">
        <Icon name="circleCheck" size={32} tone="positive" />
        <Text variant="body">No problems found.</Text>
      </View>
    );
  }
  return (
    <View className="gap-4 pb-4">
      {groups.map((group) => (
        <Section key={group.key} title={group.title}>
          {group.items.map((item) => (
            <ItemRow key={item.id} item={item} nodeId={group.nodeId} handlers={handlers} />
          ))}
        </Section>
      ))}
    </View>
  );
}
