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
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { useMediaSelection } from '../../../components/media-grid/selection';
import type { HeaderAction } from '../../../components/page-header';
import { PREFS, usePref } from '../../../store/prefs';
import { PhotosFrame } from '../components/photos-frame';
import { lastSegment } from '../local/folders';
import { useLocalLibrary } from '../local/use-local-library';
import { LibraryGrid } from '../library/library-grid';
import { LibraryError, LibraryLoading } from '../library/library-states';
import { useLibraryFeed } from '../library/use-library-feed';
import { useMediaActions } from '../library/use-media-actions';
import { useHiddenFolderKeys, usePhotoFolders } from './data';
import { useHideAction } from './folder-card';
import { hereOf } from './folders-screen';
import { folderGroupsOf, folderKeyOfParam, itemsLine, type FolderView } from './model';

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
  };
}

function useFolderView(key: PhotoFolderKey): FolderView {
  const hub = usePhotoFolders().data?.folders;
  const local = useLocalLibrary().items;
  const hidden = useHiddenFolderKeys();
  return useMemo(() => {
    const groups = folderGroupsOf({ hub: hub ?? [], local, hidden, here: hereOf() });
    const found = groups.flatMap((group) => group.folders).find((folder) => folder.key === key);
    return found ?? fallbackOf(key, hidden.has(key));
  }, [hub, local, hidden, key]);
}

function HiddenNote({ onShow }: { readonly onShow: () => void }): ReactNode {
  return (
    <Banner
      tone="info"
      title="This folder is hidden"
      body="Its photos stay out of the Library, search, people and places. Backup keeps running."
      wrapBody
      action={{ label: 'Show in Photos', onPress: onShow }}
    />
  );
}

function subtitleOf(folder: FolderView, loaded: number): string {
  return `${folder.place} · ${itemsLine(Math.max(loaded, folder.local, folder.backedUp))}`;
}

function FolderPage({ folderKey }: { readonly folderKey: PhotoFolderKey }): ReactNode {
  const folder = useFolderView(folderKey);
  const scope = useMemo<LibraryScope>(() => ({ filter: 'all', folder: folderKey }), [folderKey]);
  const feed = useLibraryFeed(scope);
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const toggle = useHideAction();
  const pref = usePref(PREFS.photos);
  const [step, setStep] = useState<MediaZoomStep | null>(null);
  const opened = step ?? (pref.status === 'ready' ? pref.value.libraryZoom : 'days');
  const actions: readonly HeaderAction[] = [
    {
      icon: folder.hidden ? 'eye' : 'eyeOff',
      label: folder.hidden ? 'Show in Photos' : 'Hide from Photos',
      primary: folder.hidden,
      onPress: (): void => {
        toggle(folder);
      },
    },
    { icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin },
  ];
  return (
    <PhotosFrame
      active="folders"
      title={folder.name}
      subtitle={subtitleOf(folder, feed.tiles.length)}
      breadcrumbs={CRUMBS}
      scroll={false}
      actions={actions}
    >
      {feed.sources}
      {folder.hidden ? (
        <HiddenNote
          onShow={() => {
            toggle(folder);
          }}
        />
      ) : null}
      <FolderGrid
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
  readonly feed: ReturnType<typeof useLibraryFeed>;
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly controls: ReturnType<typeof useMediaSelection>;
  readonly media: ReturnType<typeof useMediaActions>;
  readonly folderKey: PhotoFolderKey;
}

function FolderGrid({ feed, step, onStep, controls, media, folderKey }: GridProps): ReactNode {
  if (feed.state === 'error' && feed.tiles.length === 0) {
    return <LibraryError onRetry={feed.retry} />;
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
