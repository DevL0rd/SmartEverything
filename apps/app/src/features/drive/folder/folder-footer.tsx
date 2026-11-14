import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveChange, DriveItem } from '@smarteverything/domain';
import { changeDrive } from '../../../api/drive';
import { SelectionBar, type SelectionAction } from '../../../components/files/selection-bar';
import { Text } from '../../../components/text';
import { notify, notifyFailure } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { count } from '../../../format/number';
import { openFile, saveFile } from '../../../platform/file-actions';
import { driveLinks } from '../data';
import type { KeyHint } from './folder-keys';
import { ACTION_SPECS } from './folder-list';
import type { FolderAction } from './folder-model';

export function runChange(change: DriveChange, failure: string, done?: () => void): void {
  changeDrive(change).then((result) => {
    const first = result.failed[0];
    if (first === undefined) done?.();
    else notify({ message: failure, detail: first.reason, tone: 'critical' });
  }, notifyFailure(failure));
}

class DriveLinkMissingError extends Error {
  override readonly name = 'DriveLinkMissingError';
}

export function openItemFile(item: DriveItem, save: boolean): void {
  driveLinks
    .resolve(item.id, item.rev, 'file')
    .then((url) => {
      if (url === null) throw new DriveLinkMissingError(`No link came back for ${item.name}.`);
      return save ? saveFile(url) : openFile(url);
    })
    .catch(notifyFailure(`${item.name} could not be opened.`));
}

function trashedLine(items: readonly DriveItem[]): string {
  const only = items.length === 1 ? items[0] : undefined;
  return only === undefined
    ? `Moved ${count(items.length)} items to trash`
    : `Moved ${only.name} to trash`;
}

export function trashItems(items: readonly DriveItem[]): void {
  const itemIds = items.map((item) => item.id);
  if (itemIds.length === 0) return;
  runChange({ action: 'trash', itemIds }, 'Could not move to trash.', () => {
    notify({
      message: trashedLine(items),
      undo: () => {
        runChange({ action: 'restore', itemIds }, 'Could not restore.');
      },
    });
  });
}

export interface ItemCommands {
  readonly open: (item: DriveItem) => void;
  readonly details: (item: DriveItem) => void;
  readonly rename: (item: DriveItem) => void;
}

export function runAction(action: FolderAction, item: DriveItem, commands: ItemCommands): void {
  switch (action) {
    case 'open':
      commands.open(item);
      return;
    case 'details':
      commands.details(item);
      return;
    case 'star':
    case 'unstar':
      runChange({ action, itemIds: [item.id] }, 'Could not change the star.');
      return;
    case 'download':
      openItemFile(item, true);
      return;
    case 'rename':
      commands.rename(item);
      return;
    case 'trash':
      trashItems([item]);
  }
}

export function runOnPicked(action: FolderAction, items: readonly DriveItem[]): void {
  if (action === 'trash') trashItems(items);
  else if (action === 'star' || action === 'unstar') {
    runChange({ action, itemIds: items.map((item) => item.id) }, 'Could not change the stars.');
  } else if (action === 'download') {
    for (const item of items) openItemFile(item, true);
  }
}

function KeyCap({ keys }: { readonly keys: string }): ReactNode {
  return (
    <View className="rounded-xs border border-outline px-1">
      <Text variant="caption" tone="variant">
        {keys}
      </Text>
    </View>
  );
}

function Hint({ hint }: { readonly hint: KeyHint }): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <KeyCap keys={hint.keys} />
      <Text variant="caption" tone="variant">
        {hint.action}
      </Text>
    </View>
  );
}

export function FolderFooter({
  line,
  hints,
}: {
  readonly line: string;
  readonly hints: readonly KeyHint[];
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 border-t border-outline-variant px-4 py-2.5">
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular min-w-0 flex-1">
        {line}
      </Text>
      {pointer ? hints.map((hint) => <Hint key={hint.keys} hint={hint} />) : null}
    </View>
  );
}

function barActionsOf(picked: readonly DriveItem[], writable: boolean): readonly FolderAction[] {
  const files = picked.every((item) => item.kind !== 'folder');
  const starred = picked.every((item) => item.starred);
  return [
    starred ? 'unstar' : 'star',
    ...(files ? (['download'] as const) : []),
    ...(writable ? (['trash'] as const) : []),
  ];
}

export function FolderSelectionBar({
  picked,
  total,
  writable,
  onDone,
  onSelectAll,
}: {
  readonly picked: readonly DriveItem[];
  readonly total: number;
  readonly writable: boolean;
  readonly onDone: () => void;
  readonly onSelectAll: () => void;
}): ReactNode {
  const actions: readonly SelectionAction[] = barActionsOf(picked, writable).map((action) => ({
    label: ACTION_SPECS[action].label,
    icon: ACTION_SPECS[action].icon,
    variant: action === 'trash' ? 'destructive' : 'tonal',
    onPress: (): void => {
      runOnPicked(action, picked);
      onDone();
    },
  }));
  return (
    <SelectionBar
      summary={{ kind: 'count', count: picked.length, total, onClear: onDone, onSelectAll }}
      actions={actions}
    />
  );
}
