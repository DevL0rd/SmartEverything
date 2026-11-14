import type { ReactNode } from 'react';
import { useRef, type RefObject } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useFrameBodyWidth } from '../../../components/section-body';
import { notifyFailure } from '../../../components/toast-store';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useDrivePlacementRows, useViewerId } from '../data';
import { DriveFrame } from '../components/drive-frame';
import type { DriveHeaderProps } from '../components/drive-header';
import { detailsSlotOf } from '../details/details-pane';
import { mayRescanOf } from '../home/banner-model';
import { useDriveBanner } from '../home/drive-banner';
import { DriveTop } from '../home/drive-top';
import { ROOM, quotaLevelOf, type DriveUse, type QuotaLevel } from '../home/hero-model';
import { useDriveUse } from '../home/use-drive-use';
import { QuickLook } from '../quick-look/quick-look';
import { FolderUploads } from '../upload';
import { FolderFooter, trashItems } from './folder-footer';
import { FolderGrid } from './folder-grid';
import {
  FolderControls,
  FolderSheets,
  WIDE_FROM,
  folderHeaderOf,
  type FolderCommands,
  type NewFolderTarget,
} from './folder-header';
import { keyHintsOf, useBrowserKeys, type FolderReveal } from './folder-keys';
import { EmptyActions, EmptyFolder, commandsOf, emptyCopyOf } from './folder-empty';
import { FolderGateMessage, FolderList, FolderLoading, useFolderData } from './folder-list';
import {
  columnSort,
  footerLine,
  kindChipsOf,
  placedComputersOf,
  placedFolderIdsOf,
  selectOne,
  totalsOf,
  type FolderSlotContext,
} from './folder-model';
import { titleOf, writeTargetOf } from './place-model';
import { useBrowsePlace } from './use-browse-place';
import { useBrowsing, type BrowserProps, type Browsing } from './use-browsing';

const DETAILS = detailsSlotOf({});

const NO_DRIVE = { bytes: 0 } as const;

interface PartProps {
  readonly browser: BrowserProps;
  readonly browsing: Browsing;
  readonly commands: FolderCommands;
  readonly reveal: RefObject<FolderReveal | null>;
}

function Empty({ browser, browsing, commands }: PartProps): ReactNode {
  const { place, folderId } = browser;
  const where = folderId === null && place.kind !== 'with-me' ? place.kind : 'folder';
  const copy = emptyCopyOf(where, browsing.kind, browsing.writable);
  const shown = copy.folderAction ? commands : { ...commands, newFolder: null };
  return <EmptyFolder copy={copy} actions={<EmptyActions commands={shown} />} />;
}

function Body(props: PartProps): ReactNode {
  const { browser, browsing, reveal } = props;
  const { pages } = browser.data;
  const wide = useFrameBodyWidth() >= WIDE_FROM;
  if (pages.data === undefined) return <FolderLoading label="Reading this folder" />;
  if (browsing.visible.length === 0) return browsing.filter.empty ?? <Empty {...props} />;
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
    rootId: props.place.rootId,
    root: props.place.root,
    writable: browsing.writable,
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

function Look({ browsing }: { readonly browsing: Browsing }): ReactNode {
  const { panels, setSelection } = browsing;
  if (!panels.quickLook) return null;
  return (
    <QuickLook
      target={{
        items: browsing.visible,
        focused: browsing.focused,
        close: () => {
          panels.setQuickLook(false);
        },
        focus: (item) => {
          setSelection(() => selectOne(item.id));
        },
        details: (item) => {
          setSelection(() => selectOne(item.id));
          panels.setQuickLook(false);
          panels.setDetails(true);
        },
      }}
    />
  );
}

function Listing(props: PartProps & { readonly full: boolean }): ReactNode {
  const { browser, browsing } = props;
  const context = slotContextOf(browser, browsing);
  const totals = totalsOf(browser.place.root, browser.data.folder);
  const narrowed = browsing.visible.length !== browser.data.loaded.length && browsing.complete;
  return (
    <View className="min-h-0 flex-1 flex-row gap-4">
      <View className="min-h-0 flex-1 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        <FolderUploads
          context={context}
          where={titleOf(browser.place, browser.data.folder)}
          full={props.full}
        >
          <Body {...props} />
        </FolderUploads>
        <FolderFooter
          line={footerLine(
            totals,
            narrowed ? browsing.visible.length : null,
            browsing.picked.length,
          )}
          hints={keyHintsOf({ quickLook: true, details: true, writable: browsing.writable })}
        />
      </View>
      {browsing.panels.details ? DETAILS(context) : null}
      <Look browsing={browsing} />
    </View>
  );
}

function Controls({ browser, browsing }: Omit<PartProps, 'reveal' | 'commands'>): ReactNode {
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
      slots: { details: true, quickLook: true },
    },
    enabled,
  );
}

interface BrowserState {
  readonly browsing: Browsing;
  readonly reveal: RefObject<FolderReveal | null>;
  readonly use: DriveUse;
  readonly full: boolean;
  readonly commands: FolderCommands;
  readonly naming: NewFolderTarget | null;
  readonly banner: ReactNode | undefined;
  readonly header: DriveHeaderProps;
}

function useBrowser(props: BrowserProps): BrowserState {
  const { place, data } = props;
  const placements = useDrivePlacementRows();
  const browsing = useBrowsing(props, placedFolderIdsOf(placements, place.rootId));
  const reveal = useRef<FolderReveal>(null);
  useKeys(browsing, reveal, useIsFocused() && data.pages.data !== undefined);
  const use = useDriveUse(place.root ?? NO_DRIVE);
  const quota: QuotaLevel = place.kind === 'mine' ? quotaLevelOf(use) : ROOM;
  const full = quota.kind === 'full';
  const target = writeTargetOf(place, data.folder);
  const commands = commandsOf({
    target,
    writable: browsing.writable,
    full,
    newFolder: () => {
      browsing.panels.setNaming(true);
    },
  });
  const banner = useDriveBanner({
    online: props.online,
    root: place.root,
    mayRescan: mayRescanOf(place.root, useViewerId(), useIsOwner()),
    quota,
  });
  const header = folderHeaderOf({
    place,
    folder: data.folder,
    totals: totalsOf(place.root, data.folder),
    computers: placedComputersOf(placements, place.rootId),
    commands,
  });
  const naming =
    browsing.panels.naming && target !== null
      ? { place: target, name: titleOf(place, data.folder) }
      : null;
  return { browsing, reveal, use, full, commands, naming, banner, header };
}

function Browser(props: BrowserProps): ReactNode {
  const { place, data } = props;
  const { browsing, reveal, use, full, commands, naming, banner, header } = useBrowser(props);
  const parts = { browser: props, browsing, commands, reveal };
  return (
    <DriveFrame
      {...header}
      iconRail={browsing.panels.details}
      reconcileRootId={place.root?.id ?? null}
      {...(banner === undefined ? {} : { banner })}
      scroll={false}
    >
      <View className="min-h-0 flex-1 gap-3">
        {data.folder === null && place.root !== null ? (
          <DriveTop root={place.root} use={use} />
        ) : null}
        <Controls browser={props} browsing={browsing} />
        <Listing {...parts} full={full} />
        <FolderSheets
          renaming={browsing.panels.renaming}
          parent={naming}
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
}: {
  readonly rootId: string;
  readonly folderId: string | null;
}): ReactNode {
  const data = useFolderData(rootId, folderId);
  const lookup = useBrowsePlace(rootId, data.folder);
  const online = useSyncStatus().status === 'live';
  const { item } = useLocalSearchParams<{ item?: string }>();
  const { pages } = data;
  const failed = pages.error !== null && pages.data === undefined;
  if (lookup.place !== null && !failed) {
    return (
      <Browser
        place={lookup.place}
        folderId={folderId}
        data={data}
        online={online}
        reveal={item ?? null}
      />
    );
  }
  return (
    <DriveFrame section="index" title="Folder">
      <FolderGateMessage
        state={{
          online,
          rootKnown: lookup.place !== null,
          pending: pages.isPending || lookup.pending,
          loaded: pages.data !== undefined,
          error: pages.error,
          retry: () => pages.refetch(),
        }}
      />
    </DriveFrame>
  );
}

export interface FolderScreenProps {
  readonly rootId: string;
  readonly folderId: string | null;
}

export function FolderScreen({ rootId, folderId }: FolderScreenProps): ReactNode {
  return <Gate key={`${rootId}/${folderId ?? ''}`} rootId={rootId} folderId={folderId} />;
}
