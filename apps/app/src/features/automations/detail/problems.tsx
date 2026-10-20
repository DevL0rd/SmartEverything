import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { StatusTone } from '../../../components/tone';
import type { ProblemGroup, ProblemItem } from '../editor/problems/problem-model';

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

export type EditAt = (nodeId: string | null) => Href;

function Item({
  item,
  nodeId,
  group,
  editAt,
}: {
  readonly item: ProblemItem;
  readonly nodeId: string | null;
  readonly group: string;
  readonly editAt: EditAt;
}): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-start gap-3">
        <Icon name={ICON[item.severity]} size={20} tone={TONE[item.severity]} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="footnote" tone="variant">
            {group}
          </Text>
          <Text variant="body">{item.message}</Text>
        </View>
        <Button
          label="Open in editor"
          variant="text"
          href={editAt(nodeId)}
          hint={`Opens the editor at ${group}`}
        />
      </View>
    </View>
  );
}

export function Problems({
  groups,
  editAt,
}: {
  readonly groups: readonly ProblemGroup[];
  readonly editAt: EditAt;
}): ReactNode {
  return (
    <Card title="Problems" icon="warning" tone={groups.length === 0 ? 'default' : 'attention'}>
      {groups.length === 0 ? (
        <View className="flex-row items-center gap-3">
          <Icon name="circleCheck" size={20} tone="positive" />
          <Text variant="body">No problems found.</Text>
        </View>
      ) : (
        groups.flatMap((group) =>
          group.items.map((item) => (
            <Item
              key={item.id}
              item={item}
              nodeId={group.nodeId}
              group={group.title}
              editAt={editAt}
            />
          )),
        )
      )}
    </Card>
  );
}
