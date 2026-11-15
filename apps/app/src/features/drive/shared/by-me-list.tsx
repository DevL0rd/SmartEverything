import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveFileRequest, DriveItem, DriveSharedByMeEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListLoader } from '../../../components/list-loader';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useSharedByMe } from '../data';
import { DriveKindGlyph } from '../components/folder-glyph';
import { FileRequestsSection, useMyFileRequests } from '../requests/file-request-list';
import { useFileRequestSheet } from '../requests/file-request-sheet';
import { LinkStats } from './link-stats';
import { PagesUnloaded } from './pages-unloaded';
import {
  byMeLinksOf,
  linkChipsOf,
  linkGroupsOf,
  personChipsOf,
  type LinkChip,
  type PersonChip,
} from './shared-model';
import { stopSharing } from './stop-sharing';

export type ManageShare = (item: DriveItem) => void;

interface CardContext {
  readonly now: number;
  readonly live: boolean;
  readonly onManage: ManageShare;
  readonly onStop: (entry: DriveSharedByMeEntry) => void;
}

function Chips({
  people,
  links,
}: {
  readonly people: readonly PersonChip[];
  readonly links: readonly LinkChip[];
}): ReactNode {
  if (people.length === 0 && links.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        Only ended links are left
      </Text>
    );
  }
  return (
    <View className="flex-row flex-wrap gap-2">
      {people.map((chip) => (
        <Badge key={chip.key} icon="user" label={`${chip.name} · ${chip.role}`} tone="primary" />
      ))}
      {links.map((chip) => (
        <Badge key={chip.key} icon="link" label={`${chip.label} · ${chip.detail}`} />
      ))}
    </View>
  );
}

function SharedCard({
  entry,
  context,
}: {
  readonly entry: DriveSharedByMeEntry;
  readonly context: CardContext;
}): ReactNode {
  const profiles = useProfiles();
  const { item } = entry;
  return (
    <View className="mb-3 gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-card-pad">
      <View className="flex-row items-center gap-3">
        <DriveKindGlyph item={item} well="m" />
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {item.name}
        </Text>
      </View>
      <Chips
        people={personChipsOf(entry.grants, profiles, context.now)}
        links={linkChipsOf(entry.links, context.now)}
      />
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label="Manage"
          spoken={`Manage sharing of ${item.name}`}
          icon="share"
          variant="tonal"
          disabled={!context.live}
          onPress={() => {
            context.onManage(item);
          }}
        />
        <View className="flex-1" />
        <Button
          label="Stop sharing"
          spoken={`Stop sharing ${item.name}`}
          variant="destructive"
          disabled={!context.live}
          onPress={() => {
            context.onStop(entry);
          }}
        />
      </View>
    </View>
  );
}

export function NothingByMe(): ReactElement {
  return (
    <EmptyState
      icon="share"
      title="You have not shared anything yet"
      body="Open a file or folder and choose Share."
    />
  );
}

function useCardContext(onManage: ManageShare): CardContext {
  const client = useQueryClient();
  const now = useMinute();
  return {
    now,
    live: useSyncStatus().status === 'live',
    onManage,
    onStop: (entry): void => {
      stopSharing(client, entry, now).catch(notifyFailure('Sharing was not stopped'));
    },
  };
}

function Header({
  entries,
  groups,
  now,
  onEditRequest,
}: {
  readonly entries: number;
  readonly groups: ReturnType<typeof linkGroupsOf>;
  readonly now: number;
  readonly onEditRequest: (request: DriveFileRequest) => void;
}): ReactElement {
  return (
    <View className="gap-4 px-gutter pb-3">
      <FileRequestsSection onEdit={onEditRequest} />
      {entries === 0 ? null : (
        <>
          <Text variant="title-3" accessibilityRole="header">
            Shared items
          </Text>
          <LinkStats groups={groups} now={now} />
        </>
      )}
    </View>
  );
}

export function ByMeList({ onManage }: { readonly onManage: ManageShare }): ReactNode {
  const pages = useSharedByMe();
  const context = useCardContext(onManage);
  const requests = useMyFileRequests();
  const requestSheet = useFileRequestSheet();
  if (pages.data === undefined) return <PagesUnloaded pages={pages} label="shared_by_me" />;
  const entries = flattenPages(pages.data, (page) => page.items);
  const groups = linkGroupsOf(byMeLinksOf(entries), context.now);
  return (
    <>
      <VirtualList
        {...(entries.length === 0 && requests.length === 0
          ? {}
          : {
              header: (
                <Header
                  entries={entries.length}
                  groups={groups}
                  now={context.now}
                  onEditRequest={requestSheet.edit}
                />
              ),
            })}
        sections={[{ key: 'by-me', title: null, data: entries }]}
        keyOf={(entry) => entry.item.id}
        renderItem={(entry) => <SharedCard entry={entry} context={context} />}
        empty={<NothingByMe />}
        footer={<ListLoader loading={pages.isFetchingNextPage} />}
        onEndReached={() => {
          if (!pages.hasNextPage || pages.isFetchingNextPage) return;
          background(pages.fetchNextPage(), 'drive.shared_by_me.page_failed');
        }}
      />
      {requestSheet.host}
    </>
  );
}
