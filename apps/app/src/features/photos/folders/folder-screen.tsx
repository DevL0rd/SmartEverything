import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  PHOTO_FOLDER_KEY,
  photoFolderKindOf,
  photoFolderPlaceOf,
  type LibraryScope,
  type PhotoFolderKey,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { useMediaSelection } from '../../../components/media-grid/selection';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { PREFS, usePref } from '../../../store/prefs';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoBuckets } from '../data';
import { lastSegment } from '../local/folders';
import { useLocalLibrary } from '../local/use-local-library';
import { LibraryGrid } from '../library/library-grid';
import { selectionFrameOf } from '../library/library-selection';
import { LibraryError, LibraryLoading, LoadError } from '../library/library-states';
import { useLibraryFeed } from '../library/use-library-feed';
import { useMediaActions } from '../library/use-media-actions';
import { useFolderBackup } from './backup';
import { useHiddenFolderKeys, usePhotoFolders } from './data';
import { FolderToggles } from './folder-toggles';
import { hereOf } from './folders-screen';
import { backupIdsOf, folderGroupsOf, folderKeyOfParam, itemsLine, type FolderView } from './model';

const CRUMBS = [{ label: 'Folders', href: href.photosPage('folders') }] as const;

function fallbackOf(key: PhotoFolderKey, hidden: boolean): FolderView {
  const kind = photoFolderKindOf(key);
  return {
    key,
    kind,
    name: kind === 'drive' ? 'Folder' : lastSegment(photoFolderPlaceOf(key)),
    place: kind === 'drive' ? 'Drive' : photoFolderPlaceOf(key),
    local: 0,
    backedUp: 0,
    latest: 0,
    cover: null,
    hidden,
    backupId: null,
  };
}

interface FolderPlace {
  readonly folder: FolderView;
  readonly known: readonly string[];
}

function useFolderView(key: PhotoFolderKey): FolderPlace {
  const hub = usePhotoFolders().data?.folders;
  const local = useLocalLibrary().items;
  const hidden = useHiddenFolderKeys();
  return useMemo(() => {
    const groups = folderGroupsOf({ hub: hub ?? [], local, hidden, here: hereOf() });
    const found = groups.flatMap((group) => group.folders).find((folder) => folder.key === key);
    return { folder: found ?? fallbackOf(key, hidden.has(key)), known: backupIdsOf(groups) };
  }, [hub, local, hidden, key]);
}

function HiddenNote(): ReactNode {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name="eyeOff" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        Hidden from the Library, search, people and places. Backup keeps running.
      </Text>
    </View>
  );
}

function subtitleOf(folder: FolderView, feed: ReturnType<typeof useLibraryFeed>): string {
  if (feed.tiles.length === 0 && (feed.state === 'empty' || feed.state === 'ready')) {
    return folder.place;
  }
  return `${folder.place} · ${itemsLine(Math.max(feed.tiles.length, folder.local, folder.backedUp))}`;
}

function selectActions(
  controls: ReturnType<typeof useMediaSelection>,
  tiles: number,
): readonly ShellAction[] {
  if (controls.selection.active || tiles === 0) return [];
  return [{ icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin }];
}

function FolderPage({ folderKey }: { readonly folderKey: PhotoFolderKey }): ReactNode {
  const { folder, known } = useFolderView(folderKey);
  const backup = useFolderBackup(known);
  const scope = useMemo<LibraryScope>(() => ({ filter: 'all', folder: folderKey }), [folderKey]);
  const feed = useLibraryFeed(scope);
  const bucketsError = usePhotoBuckets(scope).error;
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const frame = selectionFrameOf(compact, { controls, tiles: feed.tiles, media });
  const pref = usePref(PREFS.photos);
  const [step, setStep] = useState<MediaZoomStep | null>(null);
  const opened = step ?? (pref.status === 'ready' ? pref.value.libraryZoom : 'days');
  return (
    <PhotosFrame
      active="folders"
      title={folder.name}
      subtitle={subtitleOf(folder, feed)}
      breadcrumbs={CRUMBS}
      scroll={false}
      actions={selectActions(controls, feed.tiles.length)}
      selection={frame.selection}
      footer={frame.footer}
    >
      {feed.sources}
      <FolderToggles folder={folder} backup={backup} />
      {folder.hidden ? <HiddenNote /> : null}
      <FolderGrid
        drive={folder.kind === 'drive'}
        bucketsError={bucketsError}
        feed={feed}
        step={opened}
        onStep={setStep}
        controls={controls}
        media={media}
        folderKey={folderKey}
      />
    </PhotosFrame>
  );
}

interface GridProps {
  readonly drive: boolean;
  readonly bucketsError: Error | null;
  readonly feed: ReturnType<typeof useLibraryFeed>;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly controls: ReturnType<typeof useMediaSelection>;
  readonly media: ReturnType<typeof useMediaActions>;
  readonly folderKey: PhotoFolderKey;
}

function FeedError({
  drive,
  bucketsError,
  retry,
}: {
  readonly drive: boolean;
  readonly bucketsError: Error | null;
  readonly retry: () => void;
}): ReactNode {
  if (!drive) return <LibraryError onRetry={retry} />;
  if (bucketsError !== null) return <ErrorState page error={bucketsError} retry={retry} />;
  return (
    <LoadError
      title="This folder did not load"
      body="The hub did not answer. The photos in this folder appear when the hub is back."
      onRetry={retry}
    />
  );
}

function FolderGrid({
  drive,
  bucketsError,
  feed,
  step,
  onStep,
  controls,
  media,
  folderKey,
}: GridProps): ReactNode {
  if (feed.state === 'error' && feed.tiles.length === 0) {
    return <FeedError drive={drive} bucketsError={bucketsError} retry={feed.retry} />;
  }
  if (feed.state === 'loading' && feed.tiles.length === 0) return <LibraryLoading />;
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <LibraryGrid
        tiles={feed.tiles}
        step={step}
        onStep={onStep}
        selection={controls}
        media={media}
        viewer={{ folder: folderKey }}
        empty={
          <EmptyState
            icon="folder"
            title="This folder is empty"
            body="Photos and videos in it show up here."
          />
        }
        footer={
          <View className="px-gutter">
            {feed.failedMore ? <LibraryError onRetry={feed.retry} /> : null}
          </View>
        }
        onEnd={feed.onEnd}
      />
    </View>
  );
}

function Missing(): ReactNode {
  return (
    <PhotosFrame active="folders" title="Folder" breadcrumbs={CRUMBS}>
      <EmptyState
        icon="folder"
        title="This folder is not known"
        body="Open a folder from Folders."
        action={<Button label="Open Folders" variant="tonal" href={href.photosPage('folders')} />}
      />
    </PhotosFrame>
  );
}

export function FolderScreen(): ReactNode {
  const raw = useLocalSearchParams<{ folder?: string }>().folder ?? '';
  const parsed = PHOTO_FOLDER_KEY.safeParse(folderKeyOfParam(raw));
  if (!parsed.success) return <Missing />;
  return <FolderPage key={parsed.data} folderKey={parsed.data} />;
}
