import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { DriveItem } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { useArranged, type Arranged } from './folder-arranged';
import { runAction } from './folder-footer';
import { useFolderPanels, type FolderPanels } from './folder-header';
import { useShiftHeld } from './folder-keys';
import { useByName, type FolderData, type FolderRowHandlers } from './folder-list';
import {
  NO_SELECTION,
  actionsOf,
  pickedOf,
  selectOne,
  selectRange,
  toggleOne,
  type FolderAction,
  type FolderSelection,
} from './folder-model';
import { placeWritable, type BrowsePlace } from './place-model';

export interface BrowserProps {
  readonly place: BrowsePlace;
  readonly folderId: string | null;
  readonly data: FolderData;
  readonly online: boolean;
  readonly reveal: string | null;
}

export interface Browsing extends Arranged {
  readonly selection: FolderSelection;
  readonly setSelection: (change: (current: FolderSelection) => FolderSelection) => void;
  readonly order: readonly string[];
  readonly picked: readonly DriveItem[];
  readonly focused: DriveItem | null;
  readonly writable: boolean;
  readonly panels: FolderPanels;
  readonly handlers: FolderRowHandlers;
}

function useOpen(
  panels: FolderPanels,
  setSelection: (selection: FolderSelection) => void,
): (item: DriveItem) => void {
  const router = useRouter();
  return (item) => {
    if (item.kind === 'folder') {
      router.push(href.driveFolder(item.id));
      return;
    }
    setSelection(selectOne(item.id));
    panels.setQuickLook(true);
  };
}

export function useBrowsing(props: BrowserProps, placed: ReadonlySet<string>): Browsing {
  const byName = useByName();
  const arranged = useArranged({ ...props, rootId: props.place.rootId }, byName);
  const panels = useFolderPanels();
  const [selection, setSelection] = useState<FolderSelection>(() =>
    props.reveal === null ? NO_SELECTION : selectOne(props.reveal),
  );
  const shiftHeld = useShiftHeld();
  const order = arranged.visible.map((item) => item.id);
  const writable = placeWritable(props.place, props.online);
  const open = useOpen(panels, setSelection);
  const commands = {
    open,
    details: (item: DriveItem): void => {
      setSelection(selectOne(item.id));
      panels.setDetails(true);
    },
    rename: panels.setRenaming,
  };
  const pick = (item: DriveItem): void => {
    setSelection((current) =>
      shiftHeld() ? selectRange(current, order, item.id) : toggleOne(current, item.id),
    );
  };
  return {
    ...arranged,
    selection,
    setSelection,
    order,
    picked: pickedOf(arranged.visible, selection),
    focused: arranged.visible.find((item) => item.id === selection.focus) ?? null,
    writable,
    panels,
    handlers: {
      byName,
      placed,
      actionsOf: (item): readonly FolderAction[] => actionsOf(item, { writable, details: true }),
      onAction: (action, item): void => {
        runAction(action, item, commands);
      },
      onPick: pick,
      highlight: arranged.filter.highlight,
      onPress: (item): void => {
        if (shiftHeld()) pick(item);
        else runAction('open', item, commands);
      },
    },
  };
}
