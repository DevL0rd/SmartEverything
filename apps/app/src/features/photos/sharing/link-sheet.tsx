import { useState, type ReactNode } from 'react';
import { Share, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  DRIVE_SHARE_CREATE,
  type DriveAlbum,
  type DriveShareCreate,
  type DriveShareCreated,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { CopyField } from '../../../components/copy-field';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { useMutationState } from '../../../store/mutation';
import { useSyncStatus } from '../../../store/selectors';
import {
  makeShareLink,
  LinkForm,
  NEW_DRAFT,
  draftReady,
  expiryOf,
  reachOf,
  type ShareDraft,
  revokeLink,
} from '../../drive';

export function albumLinkRequest(
  albumId: string,
  draft: ShareDraft,
  now: number,
): DriveShareCreate | null {
  if (!draftReady(draft)) return null;
  return DRIVE_SHARE_CREATE.parse({
    albumId,
    permission: draft.permission,
    expiresAt: expiryOf(draft.end, now),
    password: draft.password,
  });
}

function Made({
  album,
  created,
  onStopped,
}: {
  readonly album: DriveAlbum;
  readonly created: DriveShareCreated;
  readonly onStopped: () => void;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  const client = useQueryClient();
  const live = useSyncStatus().status === 'live';
  return (
    <View className="gap-3">
      <CopyField label="Link" value={created.url} />
      <Text variant="footnote" tone="variant">
        {`${reachOf(created.public)} It opens the whole album, and photos added later show up too.`}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {touch ? (
          <Button
            label="Send with another app"
            icon="share"
            variant="tonal"
            grow
            onPress={() => {
              background(
                Share.share({ message: created.url, title: album.title }),
                'photos.album_link.send_failed',
              );
            }}
          />
        ) : null}
        <Button
          label="Stop link"
          icon="unlink"
          variant="destructive"
          disabled={!live}
          onPress={() => {
            revokeLink(client, created.share.id, album.title)
              .then((stopped) => {
                if (stopped) onStopped();
              })
              .catch(notifyFailure('The link wasn’t stopped'));
          }}
        />
      </View>
    </View>
  );
}

function Footer({
  album,
  draft,
  onMade,
}: {
  readonly album: DriveAlbum;
  readonly draft: ShareDraft;
  readonly onMade: (created: DriveShareCreated) => void;
}): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  const live = useSyncStatus().status === 'live';
  return (
    <View className="flex-row justify-end">
      <Button
        label="Create link"
        icon="link"
        variant="filled"
        loading={mutation.busy}
        disabled={!live || !draftReady(draft)}
        onPress={() => {
          const request = albumLinkRequest(album.id, draft, Date.now());
          if (request === null) return;
          mutation.run(() => makeShareLink(client, request), {
            failure: 'The link wasn’t created',
            label: 'photos.album_link.create',
            onDone: onMade,
          });
        }}
      />
    </View>
  );
}

export function AlbumLinkSheet({
  album,
  open,
  onClose,
}: {
  readonly album: DriveAlbum;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<ShareDraft>(NEW_DRAFT);
  const [created, setCreated] = useState<DriveShareCreated | null>(null);
  const narrow = useIdiom() === 'touch';
  const close = (): void => {
    setCreated(null);
    setDraft(NEW_DRAFT);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={`Link to ${album.title}`}
      {...(created === null
        ? { footer: <Footer album={album} draft={draft} onMade={setCreated} /> }
        : {})}
    >
      <View className="gap-4">
        {created === null ? (
          <LinkForm draft={draft} narrow={narrow} disabled={false} onDraft={setDraft} />
        ) : (
          <Made
            album={album}
            created={created}
            onStopped={() => {
              setCreated(null);
            }}
          />
        )}
        <Button label="All your links in Drive" variant="text" href={href.drivePage('shared')} />
      </View>
    </Sheet>
  );
}
