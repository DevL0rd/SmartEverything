import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { DriveFolderPlace, DriveItem } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { Crumb } from '../../../components/breadcrumbs';
import type { HeaderAction } from '../../../components/page-header';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { ChoiceChip } from '../../../components/choice-chip';
import { FilterChip } from '../../../components/filter-chip';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Segmented } from '../../../components/segmented';
import { NameSheet } from '../../computers/files/name-sheet';
import { ChipRow } from '../../../components/library-frame';
import type { DriveHeaderProps } from '../components/drive-header';
import { driveTopHref } from '../model/section-routes';
import { FolderSelectionBar, runChange } from './folder-footer';
import {
  DEFAULT_SORT,
  NO_SELECTION,
  SORT_OPTIONS,
  folderSubtitle,
  sortOfValue,
  sortValueOf,
  selectAllOf,
  type FolderSelection,
  type FolderSort,
  type FolderTotals,
  type KindChip,
  type KindFilter,
} from './folder-model';
import {
  crumbsOf,
  placeSectionOf,
  titleOf,
  type BrowsePlace,
  type CrumbTarget,
} from './place-model';

export type FolderView = 'list' | 'cards';

export const WIDE_FROM = 600;

function crumbHref(place: BrowsePlace, target: CrumbTarget): AppHref {
  switch (target.kind) {
    case 'top':
      return place.root === null ? href.drivePage('shared') : driveTopHref(place.root);
    case 'shared':
      return href.drivePage('shared');
    case 'folder':
      return href.driveFolder(target.id);
  }
}

export function folderCrumbsOf(place: BrowsePlace, folder: DriveItem | null): readonly Crumb[] {
  return crumbsOf(place, folder).map((crumb) =>
    crumb.target === null
      ? { label: crumb.label }
      : { label: crumb.label, href: crumbHref(place, crumb.target) },
  );
}

export interface FolderCommands {
  readonly upload: (() => void) | null;
  readonly newFolder: (() => void) | null;
  readonly blocked: string | null;
}

export interface FolderHeaderInput {
  readonly place: BrowsePlace;
  readonly folder: DriveItem | null;
  readonly totals: FolderTotals;
  readonly computers: number;
  readonly commands: FolderCommands;
}

function uploadPrimary(upload: () => void): PrimaryActionProps {
  return { label: 'Upload', icon: 'upload', onPress: upload };
}

function headerActionsOf(commands: FolderCommands): readonly HeaderAction[] {
  const blockedUpload: readonly HeaderAction[] =
    commands.blocked === null || commands.upload !== null
      ? []
      : [{ icon: 'upload', label: 'Upload', disabled: true }];
  return [
    ...blockedUpload,
    ...(commands.newFolder === null
      ? []
      : [{ icon: 'plus', label: 'New folder', onPress: commands.newFolder } as const]),
  ];
}

export function folderHeaderOf(input: FolderHeaderInput): DriveHeaderProps {
  const { place, folder, totals, computers, commands } = input;
  return {
    section: placeSectionOf(place.kind),
    title: titleOf(place, folder),
    subtitle: folderSubtitle(totals, place.access === 'view', computers),
    breadcrumbs: folderCrumbsOf(place, folder),
    actions: headerActionsOf(commands),
    ...(commands.upload === null ? {} : { primary: uploadPrimary(commands.upload) }),
  };
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
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">{filter}</View>
        <Arrange {...props} />
      </View>
      <KindChips chips={chips} kind={kind} onKind={onKind} />
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

export interface NewFolderTarget {
  readonly place: DriveFolderPlace;
  readonly name: string;
}

function NewFolderSheet({
  target,
  onClose,
}: {
  readonly target: NewFolderTarget;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <NameSheet
      title="New folder"
      label="Folder name"
      initial=""
      helper={`It is made inside ${target.name}.`}
      confirmLabel="Make folder"
      onSubmit={(name) => {
        runChange({ action: 'new_folder', parent: target.place, name }, 'Could not make it.');
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
  readonly parent: NewFolderTarget | null;
  readonly onCloseRename: () => void;
  readonly onCloseNew: () => void;
}): ReactNode {
  return (
    <>
      {renaming === null ? null : <RenameSheet item={renaming} onClose={onCloseRename} />}
      {parent === null ? null : <NewFolderSheet target={parent} onClose={onCloseNew} />}
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
