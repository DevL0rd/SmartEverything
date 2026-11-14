import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { DriveItem, ProfileRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { EmptyState } from '../../../components/empty-state';
import { FileGlyph } from '../../../components/files/file-glyph';
import { ListLoader } from '../../../components/list-loader';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { flattenPages, useSharedWithMe } from '../data';
import { openItemFile } from '../folder/folder-footer';
import { entryKindOf } from '../folder/folder-list';
import { ROLE_LABEL } from '../share/share-model';
import { ProfileAvatar } from '../../profiles';
import { GroupFrame } from './group-frame';
import { PagesUnloaded } from './pages-unloaded';
import {
  sharedAgoOf,
  sharerGroupsOf,
  sharerLineOf,
  withMeKeyOf,
  withMeRowsOf,
  type SharerGroup,
  type WithMeRow,
} from './shared-model';

function openShared(item: DriveItem): void {
  if (item.kind === 'folder') router.push(href.driveFolder(item.id));
  else openItemFile(item, false);
}

function SharerHead({ group }: { readonly group: SharerGroup<ProfileRow> }): ReactNode {
  return (
    <View
      accessibilityRole="header"
      className="flex-row items-center gap-3 px-1 pb-2 pt-4"
      accessibilityLabel={`${group.name}, ${sharerLineOf(group.entries.length)}`}
    >
      {group.sharer === null ? null : <ProfileAvatar profile={group.sharer} />}
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 shrink">
        {group.name}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
        {sharerLineOf(group.entries.length)}
      </Text>
    </View>
  );
}

function renderRow(row: WithMeRow<ProfileRow>, now: number): ReactElement {
  if (row.kind === 'sharer') return <SharerHead group={row.group} />;
  const { item, grant } = row.entry;
  return (
    <GroupFrame edge={row.edge}>
      <ListRow
        title={item.name}
        leading={<FileGlyph kind={entryKindOf(item)} name={item.name} />}
        subtitle={sharedAgoOf(grant.createdAt, now)}
        chevron={item.kind === 'folder'}
        trailing={
          <Badge
            label={ROLE_LABEL[grant.role]}
            tone={grant.role === 'edit' ? 'primary' : 'neutral'}
          />
        }
        onPress={() => {
          openShared(item);
        }}
      />
    </GroupFrame>
  );
}

export function NothingWithMe(): ReactElement {
  return (
    <EmptyState
      icon="share"
      title="Nothing has been shared with you yet"
      body="When someone in the home shares a file or folder with you, it shows here."
    />
  );
}

export function WithMeList(): ReactNode {
  const pages = useSharedWithMe();
  const profiles = useProfiles();
  const now = useMinute();
  if (pages.data === undefined) return <PagesUnloaded pages={pages} label="shared_with_me" />;
  const groups = sharerGroupsOf(
    flattenPages(pages.data, (page) => page.items),
    profiles,
  );
  return (
    <VirtualList
      sections={[{ key: 'with-me', title: null, data: withMeRowsOf(groups) }]}
      keyOf={withMeKeyOf}
      typeOf={(row) => row.kind}
      renderItem={(row) => renderRow(row, now)}
      empty={<NothingWithMe />}
      footer={<ListLoader loading={pages.isFetchingNextPage} />}
      onEndReached={() => {
        if (!pages.hasNextPage || pages.isFetchingNextPage) return;
        background(pages.fetchNextPage(), 'drive.shared_with_me.page_failed');
      }}
    />
  );
}
