import { router } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveNotification, ProfileRow } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSettings, useSyncStatus } from '../../../store/selectors';
import {
  useDriveAccessRequestRows,
  useDriveChips,
  useDriveFileRequestRows,
  useDriveItemReads,
  useDriveNotificationRows,
  useDriveRootPlaces,
  useDriveTransferRows,
  useNotificationsRead,
  useViewerId,
} from '../data';
import { DriveFrame } from '../components/drive-frame';
import { drivePathOf } from '../model/drive-chip';
import { openHrefOf } from '../recent/recent-model';
import { GroupFrame } from '../shared/group-frame';
import {
  EMPTY_BODY,
  EMPTY_TITLE,
  contextOf,
  dayGroupsOf,
  inboxKeyOf,
  inboxSectionsOf,
  itemIdsOf,
  rowActionOf,
  subtitleOf,
  unreadIdsOf,
  type InboxNote,
  type NotificationLookups,
} from './notification-model';
import { NotificationRow } from './notification-row';

type Lookups = Omit<NotificationLookups, 'items'> & {
  readonly items: ReadonlyMap<string, DriveItem>;
  readonly locationOf: (item: DriveItem) => string;
};

function useLookups(rows: readonly DriveNotification[]): Lookups {
  const ids = itemIdsOf(rows);
  const reads = useDriveItemReads(ids, null);
  const chipOf = useDriveChips();
  const items = new Map<string, DriveItem>();
  const pending = new Set<string>();
  reads.forEach((read, index) => {
    const id = ids[index];
    if (read.item !== undefined) items.set(read.item.id, read.item);
    else if (read.pending && id !== undefined) pending.add(id);
  });
  return {
    profiles: useProfiles(),
    items,
    pending,
    locationOf: (item) => drivePathOf(chipOf(item.rootId), item.relPath),
    requests: useDriveAccessRequestRows(),
    transfers: useDriveTransferRows(),
    fileRequests: useDriveFileRequestRows(),
  };
}

interface RowEnv {
  readonly lookups: Lookups;
  readonly profiles: readonly ProfileRow[];
  readonly viewerId: string | null;
  readonly now: number;
  readonly onOpen: (row: DriveNotification, item: DriveItem | null) => void;
}

function renderRow(entry: InboxNote, env: RowEnv): ReactElement {
  const { row } = entry;
  const context = contextOf(row, env.lookups);
  const item = env.lookups.items.get(row.itemId) ?? null;
  return (
    <GroupFrame edge={entry.edge}>
      <NotificationRow
        row={row}
        context={context}
        actor={env.profiles.find((profile) => profile.id === row.actorProfileId) ?? null}
        item={item}
        location={item === null ? null : env.lookups.locationOf(item)}
        action={rowActionOf(row, context, env.viewerId)}
        now={env.now}
        onOpen={env.onOpen}
      />
    </GroupFrame>
  );
}

function useOpen(): (row: DriveNotification, item: DriveItem | null) => void {
  const read = useNotificationsRead();
  const roots = useDriveRootPlaces();
  return (row, item): void => {
    if (row.readAt === null) read.run({ ids: [row.id] });
    if (item !== null) router.push(openHrefOf(item, roots));
  };
}

function useHeaderActions(
  total: number,
  unread: number,
): {
  readonly actions: readonly ShellAction[];
  readonly problem: string | null;
} {
  const live = useSyncStatus().status === 'live';
  const read = useNotificationsRead();
  if (total === 0) return { problem: read.problem, actions: [] };
  return {
    problem: read.problem,
    actions: [
      {
        icon: 'circleCheck',
        label: 'Mark all read',
        disabled: !live || unread === 0 || read.busy,
        onPress: (): void => {
          read.run({ all: true });
        },
      },
    ],
  };
}

function Problem({ text }: { readonly text: string | null }): ReactElement | null {
  if (text === null) return null;
  return (
    <View className="px-gutter pb-2">
      <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
        {text}
      </Text>
    </View>
  );
}

function useRowEnv(rows: readonly DriveNotification[]): RowEnv {
  return {
    lookups: useLookups(rows),
    profiles: useProfiles(),
    viewerId: useViewerId(),
    now: useMinute(),
    onOpen: useOpen(),
  };
}

export function NotificationsScreen(): ReactNode {
  const rows = useDriveNotificationRows();
  const timeZone = useSettings().time_zone;
  const env = useRowEnv(rows);
  const { actions, problem } = useHeaderActions(rows.length, unreadIdsOf(rows).length);
  const header = <Problem text={problem} />;
  return (
    <DriveFrame
      section="notifications"
      title="Notifications"
      subtitle={subtitleOf(rows)}
      scroll={false}
      actions={actions}
    >
      {rows.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState icon="bell" title={EMPTY_TITLE} body={EMPTY_BODY} />
        </View>
      ) : (
        <View className="-mx-gutter min-h-0 flex-1">
          <VirtualList
            sections={inboxSectionsOf(dayGroupsOf(rows, env.now, timeZone))}
            keyOf={inboxKeyOf}
            renderItem={(entry) => renderRow(entry, env)}
            {...(problem === null ? {} : { header })}
          />
        </View>
      )}
    </DriveFrame>
  );
}
