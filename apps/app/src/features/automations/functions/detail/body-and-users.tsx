import type { AutomationFunctionDetail, AutomationFunctionUser } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Card } from '../../../../components/card';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { bodyLines, usedByGroups, type BodyLine } from './detail-model';

const INDENT = ['pl-0', 'pl-4', 'pl-8', 'pl-12'] as const;

export function BodyPreview({ detail }: { readonly detail: AutomationFunctionDetail }): ReactNode {
  const lines: readonly BodyLine[] = bodyLines(detail.program);
  return (
    <Card title="Steps inside" icon="automations">
      {lines.length === 0 ? (
        <Text variant="callout" tone="variant">
          The body has no steps yet.
        </Text>
      ) : (
        <View className="gap-1">
          {lines.map((line, index) => (
            <View key={line.key} className={INDENT[Math.min(line.depth, INDENT.length - 1)] ?? ''}>
              <Text variant="callout" numberOfLines={1}>
                {`${String(index + 1)}. ${line.text}`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function UserRow({
  user,
  onOpen,
}: {
  readonly user: AutomationFunctionUser;
  readonly onOpen: (user: AutomationFunctionUser) => void;
}): ReactNode {
  return (
    <Interactive
      label={`${user.name}, ${user.kind === 'automation' ? 'automation' : 'Custom Node'}`}
      onPress={() => {
        onOpen(user);
      }}
      className="min-h-touch-min flex-row items-center justify-between gap-2"
    >
      <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
        {user.name}
      </Text>
      <Badge label={user.kind === 'automation' ? 'Automation' : 'Custom Node'} tone="neutral" />
    </Interactive>
  );
}

export function UsedBy({
  detail,
  onOpen,
}: {
  readonly detail: AutomationFunctionDetail;
  readonly onOpen: (user: AutomationFunctionUser) => void;
}): ReactNode {
  const groups = usedByGroups(detail);
  return (
    <Card title="Used by" icon="link">
      <View className="gap-1">
        <Text variant="callout" tone="variant">
          {groups.summary}
        </Text>
        {[...groups.automations, ...groups.nodes].map((user) => (
          <UserRow key={`${user.kind}-${user.id}`} user={user} onOpen={onOpen} />
        ))}
      </View>
    </Card>
  );
}

export function Versions({ detail }: { readonly detail: AutomationFunctionDetail }): ReactNode {
  return (
    <Card title="Versions" icon="clock">
      <View className="min-h-touch-min flex-row items-center justify-between gap-2">
        <Text variant="body">{`Version ${String(detail.revision)}`}</Text>
        <Badge label="Current" tone="positive" />
      </View>
    </Card>
  );
}
