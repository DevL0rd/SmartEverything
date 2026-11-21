import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { percent } from '../../../format/number';
import { useIsOwner, useLoaded, useSyncStatus } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import {
  type BrowserHeader,
  type FileBrowserHandle,
  useBrowserShellParts,
  useBrowserPanels,
  FileBrowser,
  shellSearchOf,
  useFileBrowser,
  type FileLocation,
} from '../../files';
import {
  useDriveItem,
  useDriveRoot,
  useDriveRootPlaces,
  useDriveUsage,
  useViewerId,
} from '../data';
import { DriveFrame, type DriveFrameProps } from '../components/drive-frame';
import { useByName } from '../components/use-by-name';
import { mayRescanOf } from '../home/banner-model';
import { useDriveBanner } from '../home/drive-banner';
import { HeroSkeleton } from '../home/drive-hero';
import { DriveTop } from '../home/drive-top';
import { ROOM, quotaLevelOf, type QuotaLevel } from '../home/hero-model';
import { driveUseOf, useDriveUse } from '../home/use-drive-use';
import { ownDriveOf, sharedDriveOf } from '../model/drive-access';
import type { DriveSection } from '../model/section-routes';
import type { DriveOrigin } from '../source/drive-node';
import { DRIVE_PLACES } from '../source/drive-places';
import { useDriveSource } from '../source/drive-source';
import { driveHrefOf, driveSectionOf, folderLocationOf } from './drive-location-model';
import { DriveRequests } from './drive-requests';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

const NO_DRIVE = { bytes: 0 } as const;

function BrowserLoading({
  section,
  title,
}: {
  readonly section: DriveSection;
  readonly title: string;
}): ReactNode {
  return (
    <DriveFrame section={section} title={title}>
      <View aria-busy className="gap-3">
        <HeroSkeleton />
        {SKELETON_ROWS.map((key) => (
          <Skeleton key={key} className="h-row-h" />
        ))}
      </View>
    </DriveFrame>
  );
}

function NotReady({
  section,
  title,
  icon,
  action,
}: {
  readonly section: DriveSection;
  readonly title: string;
  readonly icon: 'hardDrive' | 'users';
  readonly action: ReactNode;
}): ReactNode {
  return (
    <DriveFrame section={section} title={title}>
      <EmptyState
        icon={icon}
        title={`${title} is not ready`}
        body="The hub makes it when it starts. It shows here as soon as the hub reports it."
        action={action}
      />
    </DriveFrame>
  );
}

function useRevealItem(browser: FileBrowserHandle<DriveOrigin>): void {
  const { item } = useLocalSearchParams<{ item?: string }>();
  const router = useRouter();
  const done = useRef<string | null>(null);
  const node = item === undefined ? undefined : browser.visible.find((entry) => entry.key === item);
  const reveal = useEffectEvent((key: string) => {
    const shown = browser.visible.find((entry) => entry.key === key);
    if (shown === undefined) return;
    done.current = key;
    const { commands, abilities, order } = browser;
    commands.focus(shown);
    browser.reveal.current?.reveal(order.indexOf(key));
    if (abilities.quickLook.includes(shown.kind)) commands.setPanel('quickLook', true);
    else if (abilities.details) commands.setPanel('details', true);
    router.setParams({ item: undefined });
  });
  const key = node?.key ?? null;
  useEffect(() => {
    if (key !== null && done.current !== key) reveal(key);
  }, [key]);
}

function sameQuota(left: QuotaLevel, right: QuotaLevel): boolean {
  if (left.kind === 'near' && right.kind === 'near') {
    return percent(left.share) === percent(right.share);
  }
  return left.kind === right.kind;
}

function useQuotaLevel(location: FileLocation, rootId: string | null): QuotaLevel {
  const viewerId = useViewerId();
  const usage = useDriveUsage().data;
  const mine = location.place === DRIVE_PLACES.myDrive ? rootId : null;
  return useStoreSelector(
    (state) => {
      if (mine === null) return ROOM;
      const root = state.tables.drive_roots.byId[mine] ?? NO_DRIVE;
      return quotaLevelOf(driveUseOf({ root, viewerId, usage }));
    },
    sameQuota,
    [mine, viewerId, usage],
  );
}

function BrowserTop({ rootId }: { readonly rootId: string }): ReactNode {
  const root = useDriveRoot(rootId);
  const use = useDriveUse(root ?? NO_DRIVE);
  return root === null ? null : <DriveTop root={root} use={use} />;
}

function useTop(
  location: FileLocation,
  rootId: string | null,
  filtering: boolean,
): {
  readonly top: ReactNode;
  readonly banner: ReactNode | undefined;
} {
  const online = useSyncStatus().status === 'live';
  const viewerId = useViewerId();
  const owner = useIsOwner();
  const places = useDriveRootPlaces();
  const quota = useQuotaLevel(location, rootId);
  const root = places.find((place) => place.id === rootId) ?? null;
  const banner = useDriveBanner({
    online,
    root,
    mayRescan: mayRescanOf(root, viewerId, owner),
    quota,
  });
  const top =
    location.folder === null && rootId !== null && !filtering ? (
      <BrowserTop rootId={rootId} />
    ) : null;
  return { top, banner };
}

function useDriveFileBrowser(location: FileLocation): FileBrowserHandle<DriveOrigin> {
  const router = useRouter();
  const browser = useFileBrowser({
    source: useDriveSource(),
    location,
    host: {
      hrefOf: driveHrefOf,
      onOpenFolder: (target) => {
        router.push(driveHrefOf(target));
      },
      byName: useByName(),
      placesInFrame: true,
      offlineInFrame: true,
    },
  });
  useRevealItem(browser);
  return browser;
}

function headerPartsOf(header: BrowserHeader): Partial<DriveFrameProps> {
  return {
    ...(header.subtitle === undefined ? {} : { subtitle: header.subtitle }),
    ...(header.primary === undefined ? {} : { primary: header.primary }),
    ...(header.search === null ? {} : { search: shellSearchOf(header.search) }),
  };
}

function DriveBrowser({
  location,
  rootId,
}: {
  readonly location: FileLocation;
  readonly rootId: string | null;
}): ReactNode {
  const browser = useDriveFileBrowser(location);
  const { top, banner } = useTop(location, rootId, browser.filter.active);
  const slots = useBrowserPanels(browser, { from: 'Drive', top });
  const shellParts = useBrowserShellParts(browser);
  const { header } = browser;
  return (
    <DriveFrame
      section={driveSectionOf(location)}
      title={header.title}
      actions={header.actions}
      iconRail={browser.state.panels.has('details')}
      reconcileRootId={rootId}
      scroll={false}
      {...shellParts}
      {...headerPartsOf(header)}
      {...(banner === undefined ? {} : { banner })}
    >
      <FileBrowser
        browser={browser}
        slots={{
          ...slots,
          sheets: (
            <>
              {slots.sheets}
              <DriveRequests browser={browser} />
            </>
          ),
        }}
      />
    </DriveFrame>
  );
}

const MY_DRIVE: FileLocation = { place: DRIVE_PLACES.myDrive, folder: null };

const SHARED_DRIVE: FileLocation = { place: DRIVE_PLACES.sharedDrive, folder: null };

export function MyDriveScreen(): ReactNode {
  const loaded = useLoaded();
  const mine = ownDriveOf(useDriveRootPlaces(), useViewerId());
  if (mine !== null) return <DriveBrowser location={MY_DRIVE} rootId={mine.id} />;
  if (!loaded) return <BrowserLoading section="index" title="My Drive" />;
  return (
    <NotReady
      section="index"
      title="My Drive"
      icon="hardDrive"
      action={
        <Button
          label="Open the Shared Drive"
          variant="tonal"
          href={href.drivePage('shared-drive')}
        />
      }
    />
  );
}

export function SharedDriveScreen(): ReactNode {
  const loaded = useLoaded();
  const shared = sharedDriveOf(useDriveRootPlaces());
  if (shared !== null) return <DriveBrowser location={SHARED_DRIVE} rootId={shared.id} />;
  if (!loaded) return <BrowserLoading section="shared-drive" title="Shared Drive" />;
  return (
    <NotReady
      section="shared-drive"
      title="Shared Drive"
      icon="users"
      action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
    />
  );
}

export function DriveFolderScreen(): ReactNode {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  const folder = useDriveItem(folderId, null);
  const roots = useDriveRootPlaces();
  const viewerId = useViewerId();
  if (folder.data?.kind === 'folder') {
    const location = folderLocationOf(roots, folder.data, viewerId);
    return <DriveBrowser key={folder.data.id} location={location} rootId={folder.data.rootId} />;
  }
  if (folder.isPending) return <BrowserLoading section="index" title="Folder" />;
  return (
    <DriveFrame section="index" title="Folder">
      <EmptyState
        icon="folder"
        title="This folder is not available"
        body="It was moved to the trash, or it is no longer shared with you."
        action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
      />
    </DriveFrame>
  );
}
