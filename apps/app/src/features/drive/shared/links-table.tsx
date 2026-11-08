import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveShare } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Disclosure } from '../../../components/disclosure';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListLoader } from '../../../components/list-loader';
import { Skeleton } from '../../../components/skeleton';
import { notifyFailure } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveRoots, useDriveShares } from '../../nas/data';
import { LinkStats } from './link-stats';
import { revokeLink } from './revoke-link';
import { EndedLinkRow, ShareLinkRow, type LinkRowContext } from './share-link-row';
import type { ShareOpener } from './share-target';
import {
  linkGroupsOf,
  linkListRowsOf,
  linkRowKeyOf,
  linksScopeOf,
  type LinkDensity,
  type LinkGroups,
  type LinkListRow,
} from './shared-model';

export interface LinksTableProps {
  readonly owner: boolean;
  readonly density: LinkDensity;
  readonly openShare: ShareOpener | undefined;
}

function useRevoke(): (share: DriveShare, title: string) => void {
  const client = useQueryClient();
  return (share, title) => {
    revokeLink(client, share.id, title).catch(notifyFailure('The link wasn’t revoked'));
  };
}

function useRowContext(density: LinkDensity): LinkRowContext {
  return {
    roots: useDriveRoots(),
    profiles: useProfiles(),
    viewerId: useActiveProfile()?.id ?? null,
    now: useMinute(),
    live: useSyncStatus().status === 'live',
    density,
    onRevoke: useRevoke(),
  };
}

function NewLinkButton({ openShare }: { readonly openShare: ShareOpener | undefined }): ReactNode {
  if (openShare === undefined) return null;
  return (
    <Button
      label="New link"
      icon="link"
      variant="filled"
      onPress={() => {
        openShare({ kind: 'pick' });
      }}
    />
  );
}

function NoLinks({ openShare }: { readonly openShare: ShareOpener | undefined }): ReactElement {
  return (
    <EmptyState
      icon="link"
      title="You have no links"
      body="Share a file or folder with anyone, with an end date and a password if you like."
      action={<NewLinkButton openShare={openShare} />}
    />
  );
}

function LinksHeader({
  groups,
  now,
  owner,
}: {
  readonly groups: LinkGroups;
  readonly now: number;
  readonly owner: boolean;
}): ReactElement {
  return (
    <View className="gap-3 pb-3">
      <LinkStats groups={groups} now={now} />
      <Text variant="footnote" tone="variant" className="px-1">
        {linksScopeOf(owner)}
      </Text>
    </View>
  );
}

function EndedToggle({
  row,
  onToggle,
}: {
  readonly row: Extract<LinkListRow, { readonly kind: 'ended-toggle' }>;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <View className="pb-1 pt-3">
      <Disclosure
        label="Ended links"
        count={row.count}
        open={row.open}
        onToggle={onToggle}
        hint="Ended links keep their open history until someone removes them"
      >
        {null}
      </Disclosure>
    </View>
  );
}

function renderRow(row: LinkListRow, context: LinkRowContext, onToggle: () => void): ReactElement {
  if (row.kind === 'link') {
    return <ShareLinkRow share={row.share} edge={row.edge} context={context} />;
  }
  if (row.kind === 'ended') {
    return <EndedLinkRow share={row.share} edge={row.edge} context={context} />;
  }
  return <EndedToggle row={row} onToggle={onToggle} />;
}

export function LinksLoading(): ReactNode {
  return (
    <View className="gap-3">
      <Skeleton shape="line" className="h-16" />
      <Skeleton shape="line" className="h-14" />
      <Skeleton shape="line" className="h-14" />
    </View>
  );
}

export function LinksTable({ owner, density, openShare }: LinksTableProps): ReactNode {
  const query = useDriveShares(null);
  const context = useRowContext(density);
  const [endedOpen, setEndedOpen] = useState(false);
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <ErrorState
          page
          error={query.error}
          retry={() => {
            background(query.refetch(), 'share_links.refetch_failed');
          }}
        />
      );
    }
    return <LinksLoading />;
  }
  const groups = linkGroupsOf(
    flattenPages(query.data, (page) => page.items),
    context.now,
  );
  const toggle = (): void => {
    setEndedOpen((open) => !open);
  };
  const none = groups.active.length === 0 && groups.ended.length === 0;
  return (
    <VirtualList
      {...(none ? {} : { header: <LinksHeader groups={groups} now={context.now} owner={owner} /> })}
      sections={[{ key: 'links', title: null, data: linkListRowsOf(groups, endedOpen) }]}
      keyOf={linkRowKeyOf}
      typeOf={(row) => row.kind}
      renderItem={(row) => renderRow(row, context, toggle)}
      empty={<NoLinks openShare={openShare} />}
      footer={<ListLoader loading={query.isFetchingNextPage} />}
      onEndReached={() => {
        if (!query.hasNextPage || query.isFetchingNextPage) return;
        background(query.fetchNextPage(), 'share_links.page_failed');
      }}
    />
  );
}
