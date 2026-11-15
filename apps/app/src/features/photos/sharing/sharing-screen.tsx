import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { PartnerShare, PhotoSharing } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { shiftDay } from '../../../format/time';
import { useDayKey } from '../../../store/clock';
import { useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { ActivityFeed } from './activity-feed';
import { feedOf, sharingStateOf, unreadText, type SharingState } from './model';
import { PartnerCard } from './partner-card';
import { draftOfGroup, draftOfShare, newDraft, type PartnerDraft } from './partner-draft';
import { OfflineBanner } from './offline-banner';
import { PartnerSetup } from './partner-setup';
import { usePhotoSharing } from './queries';
import { SectionTitle } from './section-title';
import { SharedAlbumCard } from './shared-album-card';

function SharedAlbums({ sharing }: { readonly sharing: PhotoSharing }): ReactNode {
  return (
    <View className="gap-3">
      <SectionTitle title="Shared albums" detail={unreadText(sharing.unread)} />
      {sharing.albums.length === 0 ? (
        <Card>
          <Text variant="body" tone="variant">
            Open an album and choose Add people to share it. People you add can see it, and the ones
            who can add photos bring their own.
          </Text>
          <View className="flex-row">
            <Button label="Open albums" variant="tonal" href={href.photosPage('albums')} />
          </View>
        </Card>
      ) : (
        <View className="gap-3 large:flex-row large:flex-wrap">
          {sharing.albums.map((album) => (
            <View key={album.albumId} className="large:min-w-96 large:max-w-1/2 large:flex-1">
              <SharedAlbumCard album={album} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Activity({ sharing }: { readonly sharing: PhotoSharing }): ReactNode {
  const today = useDayKey();
  const yesterday = shiftDay(today, -1);
  const albums = feedOf(sharing, { today, yesterday, timeZone: null });
  return (
    <View className="gap-3">
      <SectionTitle title="Activity" />
      <Card>
        {albums.length === 0 ? (
          <Text variant="body" tone="variant">
            Photos added, comments and likes in your shared albums show up here.
          </Text>
        ) : (
          <ActivityFeed albums={albums} />
        )}
      </Card>
    </View>
  );
}

function Ready({
  sharing,
  onStart,
  onChange,
}: {
  readonly sharing: PhotoSharing;
  readonly onStart: () => void;
  readonly onChange: (share: PartnerShare) => void;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <PartnerCard partners={sharing.partners} onStart={onStart} onChange={onChange} />
      <SharedAlbums sharing={sharing} />
      <Activity sharing={sharing} />
    </View>
  );
}

function Loading(): ReactNode {
  return (
    <View aria-busy className="gap-section-gap">
      <Skeleton shape="block" className="h-36 w-full" />
      <Skeleton shape="block" className="h-28 w-full" />
      <Skeleton shape="block" className="h-48 w-full" />
    </View>
  );
}

interface BodyProps {
  readonly state: SharingState;
  readonly sharing: PhotoSharing | undefined;
  readonly error: unknown;
  readonly retry: () => void;
  readonly onStart: () => void;
  readonly onChange: (share: PartnerShare) => void;
}

function Body({ state, sharing, error, retry, onStart, onChange }: BodyProps): ReactNode {
  switch (state) {
    case 'loading':
      return <Loading />;
    case 'error':
      return <ErrorState error={error} retry={retry} page />;
    case 'offline':
      return (
        <EmptyState
          icon="wifiOff"
          title="The hub is offline"
          body="Shared albums and partner sharing come back when your home hub answers."
        />
      );
    case 'empty':
    case 'ready':
      return sharing === undefined ? null : (
        <Ready sharing={sharing} onStart={onStart} onChange={onChange} />
      );
  }
}

export function SharingScreen(): ReactNode {
  const live = useSyncStatus().status === 'live';
  const query = usePhotoSharing();
  const today = useDayKey();
  const { group } = useLocalSearchParams<{ group?: string }>();
  const [draft, setDraft] = useState<PartnerDraft | null>(() =>
    group === undefined ? null : draftOfGroup(today, group),
  );
  const state = sharingStateOf({ data: query.data, failed: query.isError, live });
  return (
    <PhotosFrame
      active="sharing"
      {...(live || query.data === undefined
        ? {}
        : {
            banner: <OfflineBanner />,
          })}
    >
      <Body
        state={state}
        sharing={query.data}
        error={query.error}
        retry={() => {
          background(query.refetch(), 'photos.sharing.refetch_failed');
        }}
        onStart={() => {
          setDraft(newDraft(today));
        }}
        onChange={(share) => {
          setDraft(draftOfShare(share));
        }}
      />
      <PartnerSetup
        draft={draft}
        onDraft={setDraft}
        onClose={() => {
          setDraft(null);
        }}
      />
    </PhotosFrame>
  );
}
