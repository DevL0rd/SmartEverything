import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useRevealed } from '../../../components/show-more';
import { Text } from '../../../components/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { AppIcon } from '../apps/app-icon';
import { usePhoneRun } from '../data/phone-action';
import { dismissAppAction, dismissKeyAction } from '../model/phone-page-actions';
import { rowsOf, type NotificationGroup, type NotificationRow } from '../model/notifications-model';

const UNTITLED = 'Notification';

function useDismissals(device: Device): {
  readonly one: (group: NotificationGroup, key: string) => void;
  readonly all: (group: NotificationGroup) => void;
  readonly pending: boolean;
} {
  const dismiss = usePhoneRun(device);
  return {
    pending: dismiss.isPending,
    one: (group, key): void => {
      dismiss.mutate({
        action: dismissKeyAction(key),
        failure: `That ${group.label} notification was not dismissed`,
      });
    },
    all: (group): void => {
      dismiss.mutate({
        action: dismissAppAction(group.package),
        failure: `${group.label} notifications were not dismissed`,
      });
    },
  };
}

function GroupHead({
  group,
  iconHash,
  online,
  dismissals,
}: {
  readonly group: NotificationGroup;
  readonly iconHash: string | null;
  readonly online: boolean;
  readonly dismissals: ReturnType<typeof useDismissals>;
}): ReactNode {
  return (
    <View className="min-h-row-h flex-row items-center gap-3 px-4">
      <AppIcon label={group.label} iconHash={iconHash} size="s" />
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {group.label}
      </Text>
      <Text variant="footnote" tone="variant" className="tabular">
        {String(group.count)}
      </Text>
      <Button
        label="Dismiss all"
        hint={`Dismiss all from ${group.label}`}
        variant="text"
        disabled={!online || dismissals.pending}
        onPress={() => {
          dismissals.all(group);
        }}
      />
    </View>
  );
}

function ItemRow({
  row,
  now,
  online,
  dismissals,
}: {
  readonly row: Extract<NotificationRow, { readonly kind: 'item' }>;
  readonly now: number;
  readonly online: boolean;
  readonly dismissals: ReturnType<typeof useDismissals>;
}): ReactNode {
  const title = row.item.title ?? UNTITLED;
  return (
    <ListRow
      title={title}
      subtitle={`${row.group.label} · ${relative(row.item.at, now)}`}
      trailing={
        <IconButton
          icon="close"
          label={`Dismiss ${title}`}
          variant="standard"
          disabled={!online || dismissals.pending}
          onPress={() => {
            dismissals.one(row.group, row.item.key);
          }}
        />
      }
    />
  );
}

export function TitlesList({
  device,
  groups,
  iconOf,
}: {
  readonly device: Device;
  readonly groups: readonly NotificationGroup[];
  readonly iconOf: (app: string) => string | null;
}): ReactNode {
  const now = useMinute();
  const dismissals = useDismissals(device);
  const { shown, more } = useRevealed(rowsOf(groups));
  return (
    <Card title="Titles" icon="bell" padding="none">
      <Text variant="footnote" tone="variant" className="px-4">
        No message text is ever shown.
      </Text>
      <List>
        {shown.map((row) =>
          row.kind === 'group' ? (
            <GroupHead
              key={`group-${row.group.package}`}
              group={row.group}
              iconHash={iconOf(row.group.package)}
              online={device.online}
              dismissals={dismissals}
            />
          ) : (
            <ItemRow
              key={row.item.key}
              row={row}
              now={now}
              online={device.online}
              dismissals={dismissals}
            />
          ),
        )}
        {more}
      </List>
    </Card>
  );
}
