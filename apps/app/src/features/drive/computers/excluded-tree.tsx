import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { IconButton } from '../../../components/icon-button';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { flattenPages, useDriveFolderPages } from '../data';
import { checkStateOf, insideExcluded, toggledExcluded } from './excluded-model';

type FolderItem = Extract<DriveItem, { readonly kind: 'folder' }>;

export interface ExcludedTreeProps {
  readonly rootId: string;
  readonly baseId: string | null;
  readonly excluded: readonly string[];
  readonly disabled: boolean;
  readonly onSize: (path: string, size: number) => void;
  readonly onChange: (excluded: readonly string[]) => void;
}

function isFolder(item: DriveItem): item is FolderItem {
  return item.kind === 'folder';
}

function FolderLine({
  tree,
  folder,
  open,
  onOpen,
}: {
  readonly tree: ExcludedTreeProps;
  readonly folder: FolderItem;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
}): ReactNode {
  const state = checkStateOf(folder.relPath, tree.excluded);
  const locked = tree.disabled || insideExcluded(folder.relPath, tree.excluded);
  return (
    <View className="min-h-row-h flex-row items-center gap-2 border-t border-outline-variant">
      {folder.childCount === 0 || state === false ? (
        <View aria-hidden className="size-control-h" />
      ) : (
        <IconButton
          icon={open ? 'chevronDown' : 'chevronRight'}
          label={open ? `Hide the folders in ${folder.name}` : `Show the folders in ${folder.name}`}
          size="control"
          onPress={() => {
            onOpen(!open);
          }}
        />
      )}
      <Checkbox
        checked={state}
        label={folder.name}
        icon="folder"
        disabled={locked}
        className="min-w-0 flex-1"
        onChange={(keep) => {
          tree.onChange(toggledExcluded(tree.excluded, folder.relPath, keep));
        }}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular shrink-0">
        {bytes(folder.bytes)}
      </Text>
    </View>
  );
}

function Folder({
  tree,
  folder,
}: {
  readonly tree: ExcludedTreeProps;
  readonly folder: FolderItem;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const { onSize } = tree;
  useEffect(() => {
    onSize(folder.relPath, folder.bytes);
  }, [onSize, folder.relPath, folder.bytes]);
  return (
    <View>
      <FolderLine tree={tree} folder={folder} open={open} onOpen={setOpen} />
      {open ? (
        <View className="pl-7">
          <Level tree={tree} folderId={folder.id} />
        </View>
      ) : null}
    </View>
  );
}

function Level({
  tree,
  folderId,
}: {
  readonly tree: ExcludedTreeProps;
  readonly folderId: string | null;
}): ReactNode {
  const pages = useDriveFolderPages(tree.rootId, folderId, null);
  const folders = flattenPages(pages.data, (page) => page.items).filter(isFolder);
  if (pages.isPending) return <Skeleton shape="block" className="h-row-h" />;
  if (pages.isError) {
    return (
      <View className="flex-row flex-wrap items-center gap-2 py-2">
        <Text variant="footnote" tone="critical" className="min-w-0 flex-1">
          The folders could not be listed. The Hub did not answer.
        </Text>
        <Button
          label="Try again"
          variant="text"
          onPress={() => {
            background(pages.refetch(), 'drive.excluded_tree.retry');
          }}
        />
      </View>
    );
  }
  return (
    <>
      {folders.map((folder) => (
        <Folder key={folder.id} tree={tree} folder={folder} />
      ))}
      {pages.hasNextPage ? (
        <Button
          label="Show more folders"
          variant="text"
          loading={pages.isFetchingNextPage}
          onPress={() => {
            background(pages.fetchNextPage(), 'drive.excluded_tree.next_page');
          }}
        />
      ) : null}
    </>
  );
}

export function ExcludedTree(tree: ExcludedTreeProps): ReactNode {
  return (
    <View accessibilityRole="list" accessibilityLabel="Folders kept on this computer">
      <Level tree={tree} folderId={tree.baseId} />
    </View>
  );
}
