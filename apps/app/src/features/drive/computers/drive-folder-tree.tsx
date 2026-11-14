import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Skeleton } from '../../../components/skeleton';
import { Tap } from '../../../components/tap';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import {
  flattenPages,
  useDriveFolderPages,
  useMyDrive,
  useSharedDrive,
  useSharedWithMe,
} from '../data';
import { MY_DRIVE_LABEL, SHARED_DRIVE_LABEL } from '../model/drive-access';

export interface PickedFolder {
  readonly rootId: string;
  readonly folderItemId: string | null;
  readonly name: string;
  readonly bytes: number;
  readonly readOnly: boolean;
}

type FolderItem = Extract<DriveItem, { readonly kind: 'folder' }>;

interface TreeProps {
  readonly picked: PickedFolder | null;
  readonly onPick: (picked: PickedFolder) => void;
}

function isFolder(item: DriveItem): item is FolderItem {
  return item.kind === 'folder';
}

function samePick(picked: PickedFolder | null, rootId: string, folderId: string | null): boolean {
  return picked?.rootId === rootId && picked.folderItemId === folderId;
}

interface LineProps extends TreeProps {
  readonly target: PickedFolder;
  readonly openable: boolean;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly icon: 'hardDrive' | 'users' | 'folder';
}

function Line(props: LineProps): ReactNode {
  const { target, picked, open } = props;
  const chosen = samePick(picked, target.rootId, target.folderItemId);
  return (
    <View
      className={cn(
        'min-h-row-h flex-row items-center gap-1 rounded-sm',
        chosen ? 'bg-primary-container' : '',
      )}
    >
      {props.openable ? (
        <IconButton
          icon={open ? 'chevronDown' : 'chevronRight'}
          label={open ? `Hide the folders in ${target.name}` : `Show the folders in ${target.name}`}
          size="control"
          onPress={() => {
            props.onOpen(!open);
          }}
        />
      ) : (
        <View aria-hidden className="size-control-h" />
      )}
      <Tap
        label={`Choose ${target.name}`}
        role="radio"
        checked={chosen}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-2 pr-2"
        onPress={() => {
          props.onPick(target);
        }}
      >
        <Icon name={props.icon} size={20} tone={chosen ? 'primary' : 'variant'} />
        <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
          {target.name}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular shrink-0">
          {bytes(target.bytes)}
        </Text>
        {chosen ? <Icon name="check" size={20} tone="primary" /> : null}
      </Tap>
    </View>
  );
}

interface Level {
  readonly rootId: string;
  readonly folderId: string | null;
  readonly readOnly: boolean;
  readonly tree: TreeProps;
}

function FolderNodes({
  level,
  folders,
}: {
  readonly level: Level;
  readonly folders: readonly FolderItem[];
}): ReactNode {
  return folders.map((folder) => (
    <Node
      key={folder.id}
      target={{
        rootId: level.rootId,
        folderItemId: folder.id,
        name: folder.name,
        bytes: folder.bytes,
        readOnly: level.readOnly,
      }}
      openable={folder.childCount > 0}
      icon="folder"
      tree={level.tree}
    />
  ));
}

function Children(level: Level): ReactNode {
  const pages = useDriveFolderPages(level.rootId, level.folderId, null);
  const folders = flattenPages(pages.data, (page) => page.items).filter(isFolder);
  if (pages.isPending) return <Skeleton shape="block" className="h-row-h" />;
  if (pages.isError) {
    return (
      <Text variant="footnote" tone="critical" className="py-2">
        The folders could not be listed. The Hub did not answer.
      </Text>
    );
  }
  return (
    <>
      <FolderNodes level={level} folders={folders} />
      {pages.hasNextPage ? (
        <Button
          label="Show more folders"
          variant="text"
          loading={pages.isFetchingNextPage}
          onPress={() => {
            background(pages.fetchNextPage(), 'drive.placement_tree.next_page');
          }}
        />
      ) : null}
    </>
  );
}

function Node({
  target,
  openable,
  icon,
  tree,
}: {
  readonly target: PickedFolder;
  readonly openable: boolean;
  readonly icon: LineProps['icon'];
  readonly tree: TreeProps;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Line
        {...tree}
        target={target}
        openable={openable}
        open={open}
        onOpen={setOpen}
        icon={icon}
      />
      {open ? (
        <View className="pl-5">
          <Children
            rootId={target.rootId}
            folderId={target.folderItemId}
            readOnly={target.readOnly}
            tree={tree}
          />
        </View>
      ) : null}
    </View>
  );
}

function DriveNode({
  root,
  name,
  icon,
  tree,
}: {
  readonly root: DriveRoot | null;
  readonly name: string;
  readonly icon: LineProps['icon'];
  readonly tree: TreeProps;
}): ReactNode {
  if (root === null) return null;
  return (
    <Node
      target={{ rootId: root.id, folderItemId: null, name, bytes: root.bytes, readOnly: false }}
      openable={root.folders > 0}
      icon={icon}
      tree={tree}
    />
  );
}

function SharedWithMe({ tree }: { readonly tree: TreeProps }): ReactNode {
  const pages = useSharedWithMe();
  const shared = flattenPages(pages.data, (page) => page.items).filter((entry) =>
    isFolder(entry.item),
  );
  if (shared.length === 0) return null;
  return (
    <View className="mt-2 gap-1">
      <Text variant="footnote" tone="variant" className="px-2">
        Shared with me
      </Text>
      {shared.map(({ item, grant }) => (
        <Node
          key={item.id}
          target={{
            rootId: item.rootId,
            folderItemId: item.id,
            name: item.name,
            bytes: item.bytes,
            readOnly: grant.role === 'view',
          }}
          openable={item.kind === 'folder' && item.childCount > 0}
          icon="folder"
          tree={tree}
        />
      ))}
    </View>
  );
}

export function DriveFolderTree(tree: TreeProps): ReactNode {
  return (
    <View accessibilityRole="list" accessibilityLabel="Drives and folders" className="gap-1">
      <DriveNode root={useMyDrive()} name={MY_DRIVE_LABEL} icon="hardDrive" tree={tree} />
      <DriveNode root={useSharedDrive()} name={SHARED_DRIVE_LABEL} icon="users" tree={tree} />
      <SharedWithMe tree={tree} />
    </View>
  );
}
