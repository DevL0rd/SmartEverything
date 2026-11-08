import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { Banner } from '../../../components/banner';
import type { Crumb } from '../../../components/breadcrumbs';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { ChoiceChip } from '../../../components/choice-chip';
import { FilterChip } from '../../../components/filter-chip';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Segmented } from '../../../components/segmented';
import { NameSheet } from '../../computers/files/name-sheet';
import { ChipRow } from '../../nas/frame';
import { useLibraryRefresh } from '../../nas/frame/use-library-refresh';
import type { DriveHeaderProps } from '../components/drive-header';
import { FolderSelectionBar, runChange } from './folder-footer';
import {
  DEFAULT_SORT,
  NO_SELECTION,
  SORT_OPTIONS,
  crumbsOf,
  folderSubtitle,
  issueOf,
  sortOfValue,
  sortValueOf,
  titleOf,
  selectAllOf,
  type CrumbTarget,
  type FolderSelection,
  type FolderSort,
  type FolderTotals,
  type KindChip,
  type KindFilter,
} from './folder-model';

export type FolderView = 'list' | 'cards';

export const WIDE_FROM = 600;

function crumbHref(rootId: string, target: CrumbTarget): AppHref {
  switch (target.kind) {
    case 'drive':
      return href.drive();
    case 'root':
      return href.driveRoot(rootId);
    case 'folder':
      return href.driveRoot(rootId, { folder: target.id });
  }
}

export function folderCrumbsOf(root: DriveRoot, folder: DriveItem | null): readonly Crumb[] {
  return crumbsOf(root, folder).map((crumb) =>
    crumb.target === null
      ? { label: crumb.label }
      : { label: crumb.label, href: crumbHref(root.id, crumb.target) },
  );
}

export interface FolderHeaderInput {
  readonly root: DriveRoot;
  readonly folder: DriveItem | null;
  readonly totals: FolderTotals;
  readonly computers: number;
  readonly canMakeFolder: boolean;
  readonly onNewFolder: () => void;
}

export function folderHeaderOf(input: FolderHeaderInput): DriveHeaderProps {
  const { root, folder, totals, computers, canMakeFolder, onNewFolder } = input;
  return {
    section: 'index',
    title: titleOf(root, folder),
    subtitle: folderSubtitle(totals, root.readOnly, computers),
    breadcrumbs: folderCrumbsOf(root, folder),
    ...(canMakeFolder ? { primary: newFolderAction(onNewFolder) } : {}),
  };
}

function newFolderAction(onPress: () => void): PrimaryActionProps {
  return { label: 'New folder', icon: 'plus', onPress };
}

const VIEW_OPTIONS = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'cards', label: 'Cards', icon: 'grid' },
] as const;

function KindChips({
  chips,
  kind,
  onKind,
}: {
  readonly chips: readonly KindChip[];
  readonly kind: KindFilter;
  readonly onKind: (kind: KindFilter) => void;
}): ReactNode {
  return (
    <ChipRow label="Kinds in this folder">
      {chips.map((chip) => (
        <FilterChip
          key={chip.kind}
          label="Kind"
          value={chip.label}
          {...(chip.count === null ? {} : { count: chip.count })}
          active={chip.kind === kind}
          singleChoice
          onPress={() => {
            onKind(chip.kind);
          }}
        />
      ))}
    </ChipRow>
  );
}

export interface FolderToolbarProps {
  readonly filter: ReactNode;
  readonly chips: readonly KindChip[];
  readonly kind: KindFilter;
  readonly sort: FolderSort;
  readonly view: FolderView;
  readonly compact: boolean;
  readonly onKind: (kind: KindFilter) => void;
  readonly onSort: (sort: FolderSort) => void;
  readonly onView: (view: FolderView) => void;
}

function Arrange({
  sort,
  view,
  onSort,
  onView,
}: Pick<FolderToolbarProps, 'sort' | 'view' | 'onSort' | 'onView'>): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <ChoiceChip
        label="Sort"
        options={SORT_OPTIONS}
        value={sortValueOf(sort)}
        all={sortValueOf(DEFAULT_SORT)}
        onChange={(value) => {
          onSort(sortOfValue(value));
        }}
      />
      <Segmented
        label="View"
        options={VIEW_OPTIONS}
        value={view}
        onChange={onView}
        size="control"
      />
    </View>
  );
}

export function FolderToolbar(props: FolderToolbarProps): ReactNode {
  const { filter, chips, kind, compact, onKind } = props;
  if (compact) {
    return (
      <View className="gap-2">
        {filter}
        <KindChips chips={chips} kind={kind} onKind={onKind} />
        <View className="flex-row justify-end">
          <Arrange {...props} />
        </View>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-3">
      {filter}
      <View className="min-w-0 flex-1">
        <KindChips chips={chips} kind={kind} onKind={onKind} />
      </View>
      <Arrange {...props} />
    </View>
  );
}

export interface FolderControlsProps {
  readonly picked: readonly DriveItem[];
  readonly order: readonly string[];
  readonly writable: boolean;
  readonly setSelection: (change: (current: FolderSelection) => FolderSelection) => void;
  readonly toolbar: Omit<FolderToolbarProps, 'compact'>;
}

export function FolderControls(props: FolderControlsProps): ReactNode {
  const { picked, order, setSelection } = props;
  const compact = useFrameBodyWidth() < WIDE_FROM;
  const clear = (): void => {
    setSelection(() => NO_SELECTION);
  };
  return (
    <>
      {picked.length === 0 ? null : (
        <FolderSelectionBar
          picked={picked}
          total={order.length}
          writable={props.writable}
          onDone={clear}
          onSelectAll={() => {
            setSelection(() => selectAllOf(order));
          }}
        />
      )}
      <FolderToolbar {...props.toolbar} compact={compact} />
    </>
  );
}

export function useFolderBanner(root: DriveRoot, online: boolean): ReactNode | undefined {
  const { refresh } = useLibraryRefresh(root.id);
  const issue = issueOf(root);
  if (!online) {
    return (
      <Banner
        tone="info"
        title="The hub is not answering"
        body="Showing what Drive knew. Renames, moves and uploads wait until it is back."
      />
    );
  }
  if (issue?.kind === 'unreadable') {
    return (
      <Banner
        tone="warning"
        title={`${issue.label} is not answering`}
        body={`The hub can’t read ${issue.path ?? 'it'}. It may be unplugged or still waking up. Nothing was deleted.`}
        action={{ label: 'Check again', onPress: refresh }}
      />
    );
  }
  if (issue?.kind !== 'scanning') return undefined;
  return (
    <Banner
      tone="info"
      title="Drive is still reading this library folder"
      body="New files show up as they are found."
    />
  );
}

function RenameSheet({
  item,
  onClose,
}: {
  readonly item: DriveItem;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <NameSheet
      title="Rename"
      label="Name"
      initial={item.name}
      helper="Versions and links keep working after a rename."
      confirmLabel="Rename"
      onSubmit={(name) => {
        runChange({ action: 'rename', itemId: item.id, name }, 'Could not rename it.');
      }}
      onClose={onClose}
    />
  );
}

function NewFolderSheet({
  parent,
  onClose,
}: {
  readonly parent: DriveItem;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <NameSheet
      title="New folder"
      label="Folder name"
      initial=""
      helper={`It is made inside ${parent.name}.`}
      confirmLabel="Make folder"
      onSubmit={(name) => {
        runChange({ action: 'new_folder', parentId: parent.id, name }, 'Could not make it.');
      }}
      onClose={onClose}
    />
  );
}

export function FolderSheets({
  renaming,
  parent,
  onCloseRename,
  onCloseNew,
}: {
  readonly renaming: DriveItem | null;
  readonly parent: DriveItem | null;
  readonly onCloseRename: () => void;
  readonly onCloseNew: () => void;
}): ReactNode {
  return (
    <>
      {renaming === null ? null : <RenameSheet item={renaming} onClose={onCloseRename} />}
      {parent === null ? null : <NewFolderSheet parent={parent} onClose={onCloseNew} />}
    </>
  );
}

export interface FolderPanels {
  readonly details: boolean;
  readonly quickLook: boolean;
  readonly renaming: DriveItem | null;
  readonly naming: boolean;
  readonly setDetails: (open: boolean) => void;
  readonly setQuickLook: (open: boolean) => void;
  readonly setRenaming: (item: DriveItem | null) => void;
  readonly setNaming: (open: boolean) => void;
}

export function useFolderPanels(): FolderPanels {
  const [details, setDetails] = useState(false);
  const [quickLook, setQuickLook] = useState(false);
  const [renaming, setRenaming] = useState<DriveItem | null>(null);
  const [naming, setNaming] = useState(false);
  return { details, quickLook, renaming, naming, setDetails, setQuickLook, setRenaming, setNaming };
}
