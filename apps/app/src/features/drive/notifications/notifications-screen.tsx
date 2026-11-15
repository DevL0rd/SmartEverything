import { router } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveNotification, ProfileRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSettings, useSyncStatus } from '../../../store/selectors';
import {
  useDriveAccessRequestRows,
  useDriveFileRequestRows,
  useDriveItems,
  useDriveNotificationRows,
  useDriveRoots,
  useDriveTransferRows,
  useNotificationsRead,
  useViewerId,
} from '../data';
import { DriveFrame } from '../components/drive-frame';
import { openHrefOf } from '../recent/recent-model';
import { DRIVE_SETTINGS_PAGE } from '../settings/sections';
import { GroupFrame } from '../shared/group-frame';
import {
  EMPTY_BODY,
  EMPTY_TITLE,
  contextOf,
  dayGroupsOf,
  inboxKeyOf,
  inboxRowsOf,
  itemIdsOf,
  rowActionOf,
  subtitleOf,
  unreadIdsOf,
  type InboxRow,
  type NotificationLookups,
} from './notification-model';
import { NotificationRow } from './notification-row';
import { PUSH_KINDS_SETTING_ID } from './push-kinds';

export const OFFLINE_TITLE = 'Showing the last known notifications · reconnecting';

type Lookups = Omit<NotificationLookups, 'items'> & {
  readonly items: ReadonlyMap<string, DriveItem>;
};

function useLookups(rows: readonly DriveNotification[]): Lookups {
  const ids = itemIdsOf(rows);
  const loaded = useDriveItems(ids, null);
  const items = new Map<string, DriveItem>();
  for (const item of loaded) if (item !== undefined) items.set(item.id, item);
  return {
    profiles: useProfiles(),
    items,
    requests: useDriveAccessRequestRows(),
    transfers: useDriveTransferRows(),
    fileRequests: useDriveFileRequestRows(),
  };
}

function Day({ label }: { readonly label: string }): ReactElement {
  return (
    <View accessibilityRole="header" className="px-1 pb-2 pt-4">
      <Text variant="body-strong">{label}</Text>
    </View>
  );
}

interface RowEnv {
  readonly lookups: Lookups;
  readonly profiles: readonly ProfileRow[];
  readonly viewerId: string | null;
  readonly now: number;
  readonly onOpen: (row: DriveNotification, item: DriveItem | null) => void;
}

function renderRow(entry: InboxRow, env: RowEnv): ReactElement {
  if (entry.kind === 'day') return <Day label={entry.label} />;
  const { row } = entry;
  const context = contextOf(row, env.lookups);
  return (
    <GroupFrame edge={entry.edge}>
      <NotificationRow
        row={row}
        context={context}
        actor={env.profiles.find((profile) => profile.id === row.actorProfileId) ?? null}
        item={env.lookups.items.get(row.itemId) ?? null}
        action={rowActionOf(row, context, env.viewerId)}
        now={env.now}
        onOpen={env.onOpen}
      />
    </GroupFrame>
  );
}

function useOpen(): (row: DriveNotification, item: DriveItem | null) => void {
  const read = useNotificationsRead();
  const roots = useDriveRoots();
  return (row, item): void => {
    if (row.readAt === null) read.run({ ids: [row.id] });
    if (item !== null) router.push(openHrefOf(item, roots));
  };
}

function useHeaderActions(unread: number): {
  readonly actions: readonly ShellAction[];
  readonly problem: string | null;
} {
  const live = useSyncStatus().status === 'live';
  const read = useNotificationsRead();
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
      {
        icon: 'settings',
        label: 'Notification settings',
        iconOnly: true,
        href: href.settings.focus(DRIVE_SETTINGS_PAGE, PUSH_KINDS_SETTING_ID),
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
  const live = useSyncStatus().status === 'live';
  const env = useRowEnv(rows);
  const { actions, problem } = useHeaderActions(unreadIdsOf(rows).length);
  const header = <Problem text={problem} />;
  return (
    <DriveFrame
      section="notifications"
      title="Notifications"
      subtitle={subtitleOf(rows)}
      scroll={false}
      actions={actions}
      {...(live ? {} : { banner: <Banner tone="info" title={OFFLINE_TITLE} /> })}
    >
      <View className="-mx-gutter min-h-0 flex-1">
        <VirtualList
          sections={[
            { key: 'inbox', title: null, data: inboxRowsOf(dayGroupsOf(rows, env.now, timeZone)) },
          ]}
          keyOf={inboxKeyOf}
          typeOf={(entry) => entry.kind}
          renderItem={(entry) => renderRow(entry, env)}
          empty={<EmptyState icon="bell" title={EMPTY_TITLE} body={EMPTY_BODY} />}
          {...(problem === null ? {} : { header })}
        />
      </View>
    </DriveFrame>
  );
}
