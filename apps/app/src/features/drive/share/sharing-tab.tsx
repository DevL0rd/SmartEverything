import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveShare } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Disclosure } from '../../../components/disclosure';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { MetricStrip } from '../../../components/metric-strip';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { useScreenPaused } from '../../../design/screen-pause';
import { joinParts } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveSettings, useDriveShares } from '../data';
import type { DetailsSubject } from '../details/details-model';
import { revokeLink } from '../shared/revoke-link';
import {
  accessLabelOf,
  endedLabelOf,
  linkEndLabel,
  linkGroupsOf,
  opensLabelOf,
  personLabelOf,
  type LinkGroups,
} from '../shared/shared-model';
import { PeopleSection, SectionTitle } from './people-section';
import { LINK_STATE_LINE, itemLinkStatsOf, linkStateOf, type LinkState } from './share-model';

type SharePages = ReturnType<typeof useDriveShares>;

const STAT_COLUMNS = { compact: 3, medium: 3, expanded: 3 } as const;

const SKELETON_ROWS = ['a', 'b'] as const;

export type ShareItem = (item: DriveItem) => void;

function useWholeList(pages: SharePages): void {
  const paused = useScreenPaused();
  const due = !paused && pages.hasNextPage && !pages.isFetchingNextPage && !pages.isError;
  const { fetchNextPage } = pages;
  useEffect(() => {
    if (due) background(fetchNextPage({ cancelRefetch: false }), 'drive.item_shares.page_failed');
  }, [due, fetchNextPage]);
}

function Unloaded({ pages }: { readonly pages: SharePages }): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (!live) {
    return (
      <EmptyState
        compact
        icon="wifiOff"
        title="The hub is offline"
        body="Links come back when the hub reconnects. Links you made still open while the hub runs."
      />
    );
  }
  if (pages.isError) {
    return (
      <ErrorState
        error={pages.error}
        retry={() => {
          background(pages.refetch(), 'drive.item_shares.retry_failed');
        }}
      />
    );
  }
  return (
    <View aria-busy accessibilityLabel="Loading links" className="gap-2">
      {SKELETON_ROWS.map((key) => (
        <Skeleton key={key} shape="block" className="h-row-h-2" />
      ))}
    </View>
  );
}

interface RowContext {
  readonly by: (share: DriveShare) => string;
  readonly now: number;
  readonly live: boolean;
  readonly onRevoke: (share: DriveShare) => void;
}

function useRowContext(item: DriveItem): RowContext {
  const client = useQueryClient();
  const profiles = useProfiles();
  const viewerId = useActiveProfile()?.id ?? null;
  return {
    by: (share): string => personLabelOf(share.createdBy, viewerId, profiles),
    now: useMinute(),
    live: useSyncStatus().status === 'live',
    onRevoke: (share): void => {
      revokeLink(client, share.id, item.name).catch(notifyFailure('The link wasn’t stopped'));
    },
  };
}

function LinkRow({
  share,
  context,
}: {
  readonly share: DriveShare;
  readonly context: RowContext;
}): ReactNode {
  const title = accessLabelOf(share.permission);
  return (
    <ListRow
      title={title}
      icon={share.hasPassword ? 'lock' : 'link'}
      subtitle={joinParts([
        opensLabelOf(share),
        linkEndLabel(share, context.now),
        `by ${context.by(share)}`,
      ])}
      trailing={
        <IconButton
          icon="unlink"
          label={`Stop the ${title.toLowerCase()} link`}
          tone="critical"
          disabled={!context.live}
          onPress={() => {
            context.onRevoke(share);
          }}
        />
      }
    />
  );
}

function EndedRow({
  share,
  context,
}: {
  readonly share: DriveShare;
  readonly context: RowContext;
}): ReactNode {
  return (
    <ListRow
      title={accessLabelOf(share.permission)}
      icon="link"
      iconTone="faint"
      subtitle={joinParts([opensLabelOf(share), endedLabelOf(share), `by ${context.by(share)}`])}
    />
  );
}

function Group({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View
      role="list"
      className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1"
    >
      {children}
    </View>
  );
}

function Ended({
  shares,
  context,
}: {
  readonly shares: readonly DriveShare[];
  readonly context: RowContext;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (shares.length === 0) return null;
  return (
    <Disclosure
      label="Ended links"
      count={shares.length}
      open={open}
      onToggle={() => {
        setOpen((shown) => !shown);
      }}
      hint="Ended links keep their open history until someone removes them"
    >
      <Group>
        {shares.map((share, index) => (
          <View key={share.id} className={index === 0 ? '' : 'border-t border-outline-variant'}>
            <EndedRow share={share} context={context} />
          </View>
        ))}
      </Group>
    </Disclosure>
  );
}

function NewLink({
  item,
  onShare,
  allowed,
}: {
  readonly item: DriveItem;
  readonly onShare: ShareItem;
  readonly allowed: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const live = useSyncStatus().status === 'live';
  return (
    <Button
      label="New link"
      icon="link"
      variant="filled"
      size={pointer ? 'md' : 'lg'}
      grow={!pointer}
      disabled={!allowed || !live}
      onPress={() => {
        onShare(item);
      }}
    />
  );
}

function Links({
  groups,
  context,
}: {
  readonly groups: LinkGroups;
  readonly context: RowContext;
}): ReactNode {
  if (groups.active.length === 0 && groups.ended.length === 0) {
    return (
      <EmptyState
        compact
        icon="link"
        title="No links yet"
        body="Make a link to share this with anyone, with an end date and a password if you like."
      />
    );
  }
  return (
    <View className="gap-3">
      <MetricStrip items={itemLinkStatsOf(groups)} columns={STAT_COLUMNS} />
      {groups.active.length === 0 ? null : (
        <Group>
          {groups.active.map((share, index) => (
            <View key={share.id} className={index === 0 ? '' : 'border-t border-outline-variant'}>
              <LinkRow share={share} context={context} />
            </View>
          ))}
        </Group>
      )}
      <Ended shares={groups.ended} context={context} />
    </View>
  );
}

function LinksPart({
  item,
  onShare,
  link,
}: {
  readonly item: DriveItem;
  readonly onShare: ShareItem;
  readonly link: Exclude<LinkState, 'owner-only'>;
}): ReactNode {
  const pages = useDriveShares(item.id);
  useWholeList(pages);
  const context = useRowContext(item);
  return (
    <>
      <View className="h-px bg-outline-variant" />
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <SectionTitle text="Links" />
        <NewLink item={item} onShare={onShare} allowed={link === 'allowed'} />
      </View>
      {link === 'allowed' ? null : (
        <Text variant="footnote" tone="variant">
          {LINK_STATE_LINE[link]}
        </Text>
      )}
      {pages.data === undefined ? (
        <Unloaded pages={pages} />
      ) : (
        <Links
          groups={linkGroupsOf(
            flattenPages(pages.data, (page) => page.items),
            context.now,
          )}
          context={context}
        />
      )}
    </>
  );
}

export function SharingTab({
  subject,
  onShare,
}: {
  readonly subject: DetailsSubject;
  readonly onShare: ShareItem;
}): ReactNode {
  const { item } = subject;
  const link = linkStateOf(subject.access, useIsOwner(), useDriveSettings().data ?? null);
  return (
    <View className="gap-4">
      <PeopleSection item={item} root={subject.root} access={subject.access} />
      {link === 'owner-only' ? null : <LinksPart item={item} onShare={onShare} link={link} />}
    </View>
  );
}
