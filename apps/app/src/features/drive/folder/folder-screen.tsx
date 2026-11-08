import type { ReactNode } from 'react';
import { useRef, useState, type RefObject } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import type { DriveItem } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { useFrameBodyWidth } from '../../../components/section-body';
import { notifyFailure } from '../../../components/toast-store';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveSyncClients } from '../../nas/data';
import { DriveFrame } from '../components/drive-frame';
import { detailsSlotOf } from '../details/details-pane';
import { useArranged, type ArrangeInput, type Arranged } from './folder-arranged';
import {
  FolderFooter,
  openItemFile,
  runAction,
  trashItems,
  type ItemCommands,
} from './folder-footer';
import { FolderGrid } from './folder-grid';
import {
  FolderControls,
  FolderSheets,
  WIDE_FROM,
  folderHeaderOf,
  useFolderBanner,
  useFolderPanels,
  type FolderPanels,
} from './folder-header';
import { keyHintsOf, useBrowserKeys, useShiftHeld, type FolderReveal } from './folder-keys';
import {
  EmptyFolder,
  FolderGateMessage,
  FolderList,
  FolderLoading,
  useByName,
  useFolderData,
  type FolderRowHandlers,
} from './folder-list';
import {
  NO_SELECTION,
  actionsOf,
  columnSort,
  footerLine,
  kindChipsOf,
  pickedOf,
  selectOne,
  selectRange,
  syncedComputers,
  toggleOne,
  totalsOf,
  type FolderAction,
  type FolderSelection,
  type FolderSlotContext,
  type FolderSlots,
} from './folder-model';

export type { FolderSlotContext, FolderSlots } from './folder-model';

const NO_SLOTS: FolderSlots = { details: detailsSlotOf({}) };

interface BrowserProps extends ArrangeInput {
  readonly slots: FolderSlots;
}

interface Browsing extends Arranged {
  readonly selection: FolderSelection;
  readonly setSelection: (change: (current: FolderSelection) => FolderSelection) => void;
  readonly order: readonly string[];
  readonly picked: readonly DriveItem[];
  readonly focused: DriveItem | null;
  readonly writable: boolean;
  readonly panels: FolderPanels;
  readonly handlers: FolderRowHandlers;
}

function useItemCommands(
  props: BrowserProps,
  panels: FolderPanels,
  setSelection: (selection: FolderSelection) => void,
): ItemCommands {
  const router = useRouter();
  const { root, slots } = props;
  return {
    open: (item): void => {
      if (item.kind === 'folder') router.push(href.driveRoot(root.id, { folder: item.id }));
      else if (slots.quickLook === undefined) openItemFile(item, false);
      else {
        setSelection(selectOne(item.id));
        panels.setQuickLook(true);
      }
    },
    details: (item): void => {
      setSelection(selectOne(item.id));
      panels.setDetails(true);
    },
    rename: panels.setRenaming,
  };
}

function useBrowsing(props: BrowserProps): Browsing {
  const { root, slots } = props;
  const byName = useByName();
  const arranged = useArranged(props, byName);
  const panels = useFolderPanels();
  const [selection, setSelection] = useState<FolderSelection>(NO_SELECTION);
  const shiftHeld = useShiftHeld();
  const order = arranged.visible.map((item) => item.id);
  const writable = props.online && !root.readOnly;
  const commands = useItemCommands(props, panels, setSelection);
  const abilities = { writable, details: slots.details !== undefined };
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
      actionsOf: (item): readonly FolderAction[] => actionsOf(item, abilities),
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

interface PartProps {
  readonly browser: BrowserProps;
  readonly browsing: Browsing;
  readonly reveal: RefObject<FolderReveal | null>;
}

function Body({ browser, browsing, reveal }: PartProps): ReactNode {
  const { pages } = browser.data;
  const wide = useFrameBodyWidth() >= WIDE_FROM;
  if (pages.data === undefined) return <FolderLoading label="Reading this folder" />;
  if (browsing.visible.length === 0)
    return browsing.filter.empty ?? <EmptyFolder root={browser.root} kind={browsing.kind} />;
  const shared = {
    items: browsing.visible,
    selection: browsing.selection.ids,
    handlers: browsing.handlers,
    loadingMore: pages.isFetchingNextPage,
    stale: pages.isPlaceholderData,
    footer: browsing.filter.footer,
    onMore: (): void => {
      if (!pages.hasNextPage || pages.isFetchingNextPage) return;
      pages.fetchNextPage().catch(notifyFailure('More of this folder could not be read.'));
    },
  };
  if (browsing.view === 'cards') return <FolderGrid {...shared} ref={reveal} />;
  return (
    <FolderList
      {...shared}
      ref={reveal}
      wide={wide}
      sort={browsing.sort}
      onSort={(key) => {
        browsing.setSort(columnSort(browsing.sort, key));
      }}
    />
  );
}

function slotContextOf(props: BrowserProps, browsing: Browsing): FolderSlotContext {
  return {
    root: props.root,
    folder: props.data.folder,
    items: browsing.visible,
    picked: browsing.picked,
    focused: browsing.focused,
    close: (): void => {
      browsing.panels.setDetails(false);
      browsing.panels.setQuickLook(false);
    },
  };
}

function Listing({ browser, browsing, reveal }: PartProps): ReactNode {
  const { root, data, slots } = browser;
  const context = slotContextOf(browser, browsing);
  const totals = totalsOf(root, data.folder);
  const narrowed = browsing.visible.length !== data.loaded.length && browsing.complete;
  return (
    <View className="min-h-0 flex-1 flex-row gap-4">
      <View className="min-h-0 flex-1 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        <Body browser={browser} browsing={browsing} reveal={reveal} />
        {slots.upload?.(context)}
        <FolderFooter
          line={footerLine(
            totals,
            narrowed ? browsing.visible.length : null,
            browsing.picked.length,
          )}
          hints={keyHintsOf({
            quickLook: slots.quickLook !== undefined,
            details: slots.details !== undefined,
            writable: browsing.writable,
          })}
        />
      </View>
      {browsing.panels.details ? slots.details?.(context) : null}
      {browsing.panels.quickLook ? slots.quickLook?.(context) : null}
    </View>
  );
}

function Controls({
  browser,
  browsing,
}: {
  readonly browser: BrowserProps;
  readonly browsing: Browsing;
}): ReactNode {
  return (
    <FolderControls
      picked={browsing.picked}
      order={browsing.order}
      writable={browsing.writable}
      setSelection={browsing.setSelection}
      toolbar={{
        filter: browsing.filter.field,
        chips: kindChipsOf(browser.data.loaded, browsing.complete),
        kind: browsing.kind,
        sort: browsing.sort,
        view: browsing.view,
        onKind: browsing.setKind,
        onSort: browsing.setSort,
        onView: browsing.setView,
      }}
    />
  );
}

function useKeys(
  browsing: Browsing,
  slots: FolderSlots,
  reveal: RefObject<FolderReveal | null>,
  enabled: boolean,
): void {
  useBrowserKeys(
    {
      ...browsing,
      grid: browsing.view === 'cards',
      reveal,
      open: (item) => {
        browsing.handlers.onAction('open', item);
      },
      trash: trashItems,
      focusFilter: browsing.filter.focus,
      slots: {
        details: slots.details !== undefined,
        quickLook: slots.quickLook !== undefined,
      },
    },
    enabled,
  );
}

function Browser(props: BrowserProps): ReactNode {
  const { root, data, slots } = props;
  const browsing = useBrowsing(props);
  const reveal = useRef<FolderReveal>(null);
  const visible = useIsFocused();
  useKeys(browsing, slots, reveal, visible && data.pages.data !== undefined);
  const iconRail = browsing.panels.details ? slots.details !== undefined : false;
  const banner = useFolderBanner(root, props.online);
  const clients = useDriveSyncClients();
  const header = folderHeaderOf({
    root,
    folder: data.folder,
    totals: totalsOf(root, data.folder),
    computers: syncedComputers(root, clients),
    canMakeFolder: browsing.writable && data.folder !== null,
    onNewFolder: () => {
      browsing.panels.setNaming(true);
    },
  });
  return (
    <DriveFrame
      {...header}
      iconRail={iconRail}
      reconcileRootId={root.id}
      {...(banner === undefined ? {} : { banner })}
      scroll={false}
    >
      <View className="min-h-0 flex-1 gap-3">
        <Controls browser={props} browsing={browsing} />
        <Listing browser={props} browsing={browsing} reveal={reveal} />
        <FolderSheets
          renaming={browsing.panels.renaming}
          parent={browsing.panels.naming ? data.folder : null}
          onCloseRename={() => {
            browsing.panels.setRenaming(null);
          }}
          onCloseNew={() => {
            browsing.panels.setNaming(false);
          }}
        />
      </View>
    </DriveFrame>
  );
}

function Gate({
  rootId,
  folderId,
  slots,
}: {
  readonly rootId: string;
  readonly folderId: string | null;
  readonly slots: FolderSlots;
}): ReactNode {
  const data = useFolderData(rootId, folderId);
  const online = useSyncStatus().status === 'live';
  const { root, pages } = data;
  const failed = pages.error !== null && pages.data === undefined;
  if (root !== null && !failed) {
    return <Browser root={root} folderId={folderId} data={data} slots={slots} online={online} />;
  }
  return (
    <DriveFrame section="index" title="Folder">
      <FolderGateMessage
        state={{
          online,
          rootKnown: root !== null,
          pending: pages.isPending,
          loaded: pages.data !== undefined,
          error: pages.error,
          retry: () => pages.refetch(),
        }}
      />
    </DriveFrame>
  );
}

export function FolderScreen({ slots = NO_SLOTS }: { readonly slots?: FolderSlots }): ReactNode {
  const params = useLocalSearchParams<{ rootId: string; folder?: string }>();
  const folderId = params.folder ?? null;
  return (
    <Gate
      key={`${params.rootId}/${folderId ?? ''}`}
      rootId={params.rootId}
      folderId={folderId}
      slots={slots}
    />
  );
}
