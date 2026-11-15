import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type {
  DriveSharedWithMeEntry as SharedWithMeEntry,
  ProfileRow,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { EmptyState } from '../../../components/empty-state';
import { ListLoader } from '../../../components/list-loader';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { flattenPages, useSharedWithMe } from '../data';
import { ROLE_LABEL } from '../share/share-model';
import { ProfileAvatar } from '../../profiles';
import { FileRow, type FileBrowserHandle } from '../../files';
import { DriveListFrame, useDriveNodeList } from '../source/drive-lists';
import { driveNodeOf, type DriveNode, type DriveOrigin } from '../source/drive-node';
import { GroupFrame } from './group-frame';
import { PagesUnloaded } from './pages-unloaded';
import {
  sharerGroupsOf,
  sharerLineOf,
  withMeKeyOf,
  withMeLineOf,
  withMeRowsOf,
  type SharerGroup,
  type WithMeRow,
} from './shared-model';

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

class MissingSharedNodeError extends Error {
  override readonly name = 'MissingSharedNodeError';
  constructor(itemId: string) {
    super(`The shared item ${itemId} has no file node.`);
  }
}

interface WithMeNodes {
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly nodeOf: ReadonlyMap<string, DriveNode>;
}

function GrantBadges({ item, grant }: SharedWithMeEntry): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      {item.locked && grant.role === 'view' ? <Badge icon="eyeOff" label="View only" /> : null}
      <Badge label={ROLE_LABEL[grant.role]} tone={grant.role === 'edit' ? 'primary' : 'neutral'} />
    </View>
  );
}

function renderRow(row: WithMeRow<ProfileRow>, now: number, list: WithMeNodes): ReactElement {
  if (row.kind === 'sharer') return <SharerHead group={row.group} />;
  const node = list.nodeOf.get(row.entry.item.id);
  if (node === undefined) throw new MissingSharedNodeError(row.entry.item.id);
  return (
    <GroupFrame edge={row.edge}>
      <FileRow
        node={node}
        browser={list.browser}
        wide={false}
        look={{
          caption: withMeLineOf(row.entry.grant, now),
          trailing: <GrantBadges item={row.entry.item} grant={row.entry.grant} />,
        }}
      />
    </GroupFrame>
  );
}

function useWithMeNodes(entries: readonly SharedWithMeEntry[]): WithMeNodes {
  const { browser, nodes } = useDriveNodeList('shared-with-me', (context) =>
    entries.map((entry) => driveNodeOf(entry.item, context)),
  );
  return { browser, nodeOf: new Map(nodes.map((node) => [node.key, node])) };
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
  const entries = flattenPages(pages.data, (page) => page.items);
  const list = useWithMeNodes(entries);
  if (pages.data === undefined)
    return <PagesUnloaded pages={pages} label="shared_with_me" shape="groups" />;
  const groups = sharerGroupsOf(entries, profiles);
  return (
    <DriveListFrame browser={list.browser}>
      <VirtualList
        sections={[{ key: 'with-me', title: null, data: withMeRowsOf(groups) }]}
        keyOf={withMeKeyOf}
        typeOf={(row) => row.kind}
        renderItem={(row) => renderRow(row, now, list)}
        empty={<NothingWithMe />}
        footer={<ListLoader loading={pages.isFetchingNextPage} />}
        onEndReached={() => {
          if (!pages.hasNextPage || pages.isFetchingNextPage) return;
          background(pages.fetchNextPage(), 'drive.shared_with_me.page_failed');
        }}
      />
    </DriveListFrame>
  );
}
