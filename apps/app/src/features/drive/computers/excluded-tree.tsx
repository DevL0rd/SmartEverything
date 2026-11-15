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
import {
  checkStateOf,
  excludedChildrenOf,
  insideExcluded,
  toggledExcluded,
} from './excluded-model';

type FolderItem = Extract<DriveItem, { readonly kind: 'folder' }>;

export interface ExcludedTreeProps {
  readonly rootId: string;
  readonly baseId: string | null;
  readonly basePath: string | null;
  readonly baseName: string;
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
  const [open, setOpen] = useState(() => checkStateOf(folder.relPath, tree.excluded) === 'mixed');
  const { onSize } = tree;
  useEffect(() => {
    onSize(folder.relPath, folder.bytes);
  }, [onSize, folder.relPath, folder.bytes]);
  return (
    <View>
      <FolderLine tree={tree} folder={folder} open={open} onOpen={setOpen} />
      {open ? (
        <View className="pl-7">
          <Level tree={tree} folderId={folder.id} path={folder.relPath} name={folder.name} />
        </View>
      ) : null}
    </View>
  );
}

function useGoneSizes(
  tree: ExcludedTreeProps,
  path: string | null,
  folders: readonly FolderItem[] | null,
): void {
  const { onSize, excluded } = tree;
  useEffect(() => {
    if (folders === null) return;
    const listed = new Set(folders.map((folder) => folder.relPath));
    for (const gone of excludedChildrenOf(path, excluded)) {
      if (!listed.has(gone)) onSize(gone, 0);
    }
  }, [onSize, excluded, path, folders]);
}

function LevelFailed({ onRetry }: { readonly onRetry: () => void }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2 py-2">
      <Text variant="footnote" tone="critical" className="min-w-0 flex-1">
        The folders could not be listed. The Hub did not answer.
      </Text>
      <Button label="Try again" variant="text" onPress={onRetry} />
    </View>
  );
}

function NoFolders({ name }: { readonly name: string }): ReactNode {
  return (
    <View className="min-h-row-h justify-center border-t border-outline-variant">
      <Text variant="footnote" tone="variant">
        {`No folders inside ${name}`}
      </Text>
    </View>
  );
}

function Level({
  tree,
  folderId,
  path,
  name,
}: {
  readonly tree: ExcludedTreeProps;
  readonly folderId: string | null;
  readonly path: string | null;
  readonly name: string;
}): ReactNode {
  const pages = useDriveFolderPages(tree.rootId, folderId, null);
  const folders = flattenPages(pages.data, (page) => page.items).filter(isFolder);
  const complete = pages.isSuccess && !pages.hasNextPage;
  useGoneSizes(tree, path, complete ? folders : null);
  if (pages.isPending) return <Skeleton shape="block" className="h-row-h" />;
  if (pages.isError) {
    return (
      <LevelFailed
        onRetry={() => {
          background(pages.refetch(), 'drive.excluded_tree.retry');
        }}
      />
    );
  }
  if (complete && folders.length === 0) return <NoFolders name={name} />;
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
      <Level tree={tree} folderId={tree.baseId} path={tree.basePath} name={tree.baseName} />
    </View>
  );
}
