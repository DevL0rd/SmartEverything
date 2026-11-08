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
import { flattenPages, useDriveFolderPages } from '../../nas/data';

export const EVERYTHING = '';

export type CheckState = boolean | 'mixed';

export interface TreeEntry {
  readonly path: string;
  readonly bytes: number;
}

export interface TreeFacts {
  readonly listings: ReadonlyMap<string, readonly TreeEntry[]>;
  readonly skipped: (path: string) => boolean;
}

export function isUnder(path: string, folder: string): boolean {
  return folder === EVERYTHING || path === folder || path.startsWith(`${folder}/`);
}

export function parentOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? EVERYTHING : path.slice(0, cut);
}

export function ancestorsOf(path: string): readonly string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function normalised(selection: readonly string[]): readonly string[] {
  const unique = [...new Set(selection)];
  return unique
    .filter((path) => !unique.some((other) => other !== path && isUnder(path, other)))
    .sort();
}

export function selectionFromWire(selected: readonly string[]): readonly string[] {
  return selected.length === 0 ? [EVERYTHING] : normalised(selected);
}

export function selectionToWire(selection: readonly string[]): readonly string[] | null {
  if (selection.length === 0) return null;
  return selection.includes(EVERYTHING) ? [] : normalised(selection);
}

export function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  const a = normalised(left);
  const b = normalised(right);
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

export function checkStateOf(path: string, selection: readonly string[]): CheckState {
  if (selection.some((entry) => isUnder(path, entry))) return true;
  return selection.some((entry) => isUnder(entry, path)) ? 'mixed' : false;
}

function covered(path: string, selection: readonly string[], facts: TreeFacts): boolean {
  return facts.skipped(path) || selection.some((entry) => isUnder(path, entry));
}

function collapsed(
  selection: readonly string[],
  from: string,
  facts: TreeFacts,
): readonly string[] {
  if (from === EVERYTHING) return selection;
  const parent = parentOf(from);
  const children = facts.listings.get(parent);
  if (children?.every((child) => covered(child.path, selection, facts)) !== true) return selection;
  const kept = selection.filter((entry) => !isUnder(entry, parent));
  return collapsed([...kept, parent], parent, facts);
}

export function tickedOn(
  selection: readonly string[],
  path: string,
  facts: TreeFacts,
): readonly string[] {
  const kept = selection.filter((entry) => !isUnder(entry, path));
  return normalised(collapsed([...kept, path], path, facts));
}

function split(holder: string, path: string, facts: TreeFacts): readonly string[] | null {
  const levels = [holder, ...ancestorsOf(path).filter((folder) => !isUnder(holder, folder))];
  const added: string[] = [];
  for (const level of levels) {
    const children = facts.listings.get(level);
    if (children === undefined) return null;
    for (const child of children) {
      if (!isUnder(path, child.path) && !facts.skipped(child.path)) added.push(child.path);
    }
  }
  return added;
}

export function tickedOff(
  selection: readonly string[],
  path: string,
  facts: TreeFacts,
): readonly string[] | null {
  const holder = selection.find((entry) => entry !== path && isUnder(path, entry));
  const kept = selection.filter((entry) => !isUnder(entry, path) && entry !== holder);
  if (holder === undefined) return normalised(kept);
  const added = split(holder, path, facts);
  return added === null ? null : normalised([...kept, ...added]);
}

export function toggled(
  selection: readonly string[],
  path: string,
  on: boolean,
  facts: TreeFacts,
): readonly string[] | null {
  return on ? tickedOn(selection, path, facts) : tickedOff(selection, path, facts);
}

export function openPathsOf(selection: readonly string[]): ReadonlySet<string> {
  return new Set(selection.flatMap((entry) => ancestorsOf(entry)));
}

export function sizeLineOf(entry: TreeEntry, skipped: boolean): string {
  return skipped ? 'skipped' : bytes(entry.bytes);
}

type FolderItem = Extract<DriveItem, { readonly kind: 'folder' }>;

function isFolder(item: DriveItem): item is FolderItem {
  return item.kind === 'folder';
}

export function entriesOf(items: readonly DriveItem[]): readonly TreeEntry[] {
  return items.map((item) => ({ path: item.relPath, bytes: item.bytes }));
}

export function sameEntries(
  left: readonly TreeEntry[] | undefined,
  right: readonly TreeEntry[],
): boolean {
  return (
    left?.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return other?.path === entry.path && other.bytes === entry.bytes;
    })
  );
}

export function withListing(
  listings: ReadonlyMap<string, readonly TreeEntry[]>,
  path: string,
  entries: readonly TreeEntry[],
): ReadonlyMap<string, readonly TreeEntry[]> {
  if (sameEntries(listings.get(path), entries)) return listings;
  return new Map(listings).set(path, entries);
}

export interface SelectiveTreeProps {
  readonly rootId: string;
  readonly rootLabel: string;
  readonly selection: readonly string[];
  readonly facts: TreeFacts;
  readonly initialOpen: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onListing: (path: string, entries: readonly TreeEntry[]) => void;
  readonly onChange: (selection: readonly string[]) => void;
}

interface LevelProps {
  readonly tree: SelectiveTreeProps;
  readonly path: string;
  readonly folderId: string | null;
  readonly depth: number;
  readonly open: ReadonlySet<string>;
  readonly onOpen: (path: string, open: boolean) => void;
}

function Expander({
  folder,
  open,
  onOpen,
}: {
  readonly folder: FolderItem;
  readonly open: boolean;
  readonly onOpen: (path: string, open: boolean) => void;
}): ReactNode {
  if (folder.childCount === 0) return <View aria-hidden className="size-control-h" />;
  return (
    <IconButton
      icon={open ? 'chevronDown' : 'chevronRight'}
      label={open ? `Hide the folders in ${folder.name}` : `Show the folders in ${folder.name}`}
      size="control"
      onPress={() => {
        onOpen(folder.relPath, !open);
      }}
    />
  );
}

function FolderLine({
  level,
  folder,
}: {
  readonly level: LevelProps;
  readonly folder: FolderItem;
}): ReactNode {
  const { tree } = level;
  const skipped = tree.facts.skipped(folder.relPath);
  const state = skipped ? false : checkStateOf(folder.relPath, tree.selection);
  const next = (on: boolean): readonly string[] | null =>
    toggled(tree.selection, folder.relPath, on, tree.facts);
  const blocked = tree.disabled || skipped || next(state !== true) === null;
  return (
    <View className="min-h-row-h flex-row items-center gap-2 border-t border-outline-variant">
      <Expander folder={folder} open={level.open.has(folder.relPath)} onOpen={level.onOpen} />
      <Checkbox
        checked={state}
        label={folder.name}
        icon="folder"
        disabled={blocked}
        className="min-w-0 flex-1"
        onChange={(on) => {
          const changed = next(on);
          if (changed !== null) tree.onChange(changed);
        }}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular shrink-0">
        {sizeLineOf({ path: folder.relPath, bytes: folder.bytes }, skipped)}
      </Text>
    </View>
  );
}

function useCompleteListing(level: LevelProps): {
  readonly folders: readonly FolderItem[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly retry: () => void;
} {
  const pages = useDriveFolderPages(level.tree.rootId, level.folderId, null);
  const { data, hasNextPage, isFetchingNextPage, isError, isSuccess, fetchNextPage, refetch } =
    pages;
  const complete = isSuccess && !hasNextPage;
  const { onListing } = level.tree;
  const { path } = level;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) {
      background(fetchNextPage(), 'drive.selective.next_page');
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
  useEffect(() => {
    if (complete) onListing(path, entriesOf(flattenPages(data, (page) => page.items)));
  }, [complete, data, path, onListing]);
  return {
    folders: flattenPages(data, (page) => page.items).filter(isFolder),
    loading: !complete && !isError,
    failed: isError,
    retry: (): void => {
      background(refetch(), 'drive.selective.retry');
    },
  };
}

function LevelState({
  level,
  loading,
  failed,
  empty,
  retry,
}: {
  readonly level: LevelProps;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly empty: boolean;
  readonly retry: () => void;
}): ReactNode {
  if (failed) {
    return (
      <View className="flex-row flex-wrap items-center gap-2 py-2">
        <Text variant="footnote" tone="critical" className="min-w-0 flex-1">
          The folders could not be listed. The hub did not answer.
        </Text>
        <Button label="Try again" variant="text" onPress={retry} />
      </View>
    );
  }
  if (loading) return <Skeleton shape="block" className="h-row-h" />;
  if (!empty || level.depth > 0) return null;
  return (
    <Text variant="footnote" tone="variant" className="py-2">
      {`${level.tree.rootLabel} has no folders inside, so every file in it is kept here.`}
    </Text>
  );
}

function Level(level: LevelProps): ReactNode {
  const listing = useCompleteListing(level);
  return (
    <>
      <LevelState
        level={level}
        loading={listing.loading}
        failed={listing.failed}
        empty={listing.folders.length === 0}
        retry={listing.retry}
      />
      {listing.folders.map((folder) => (
        <View key={folder.id}>
          <FolderLine level={level} folder={folder} />
          {level.open.has(folder.relPath) ? (
            <View className="pl-7">
              <Level
                {...level}
                path={folder.relPath}
                folderId={folder.id}
                depth={level.depth + 1}
              />
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

export function SelectiveTree(props: SelectiveTreeProps): ReactNode {
  const [open, setOpen] = useState(props.initialOpen);
  return (
    <View accessibilityRole="list" accessibilityLabel={`Folders of ${props.rootLabel} kept here`}>
      <Level
        tree={props}
        path={EVERYTHING}
        folderId={null}
        depth={0}
        open={open}
        onOpen={(path, next) => {
          setOpen((now) => {
            const changed = new Set(now);
            if (next) changed.add(path);
            else changed.delete(path);
            return changed;
          });
        }}
      />
    </View>
  );
}
