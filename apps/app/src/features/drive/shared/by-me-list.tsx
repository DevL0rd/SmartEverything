import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveSharedByMeEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FileGlyph } from '../../../components/files/file-glyph';
import { ListLoader } from '../../../components/list-loader';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { flattenPages, useSharedByMe } from '../data';
import { entryKindOf } from '../folder/folder-list';
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
        <FileGlyph kind={entryKindOf(item)} name={item.name} well="m" />
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {item.name}
        </Text>
      </View>
      <Chips
        people={personChipsOf(entry.grants, profiles)}
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

export function ByMeList({ onManage }: { readonly onManage: ManageShare }): ReactNode {
  const pages = useSharedByMe();
  const context = useCardContext(onManage);
  if (pages.data === undefined) return <PagesUnloaded pages={pages} label="shared_by_me" />;
  const entries = flattenPages(pages.data, (page) => page.items);
  const groups = linkGroupsOf(byMeLinksOf(entries), context.now);
  return (
    <VirtualList
      {...(entries.length === 0
        ? {}
        : {
            header: (
              <View className="px-gutter pb-3">
                <LinkStats groups={groups} now={context.now} />
              </View>
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
  );
}
