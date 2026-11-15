import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { AlbumActivity, DriveAlbum } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { count } from '../../../format/number';
import { shiftDay } from '../../../format/time';
import { useDayKey } from '../../../store/clock';
import { useMutationState } from '../../../store/mutation';
import { useActiveProfile } from '../../../store/people';
import { ActivityDayList } from './activity-feed';
import { addAlbumActivity, removeAlbumActivity } from './api';
import { daysOf, likedBy, likesOf } from './model';
import { invalidateAlbumActivity, useAlbumActivity } from './queries';

export interface ActivityPanelProps {
  readonly album: DriveAlbum;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function entriesOf(
  pages: readonly { readonly items: readonly AlbumActivity[] }[],
): readonly AlbumActivity[] {
  return pages.flatMap((page) => page.items);
}

function LikeBar({
  album,
  entries,
}: {
  readonly album: DriveAlbum;
  readonly entries: readonly AlbumActivity[];
}): ReactNode {
  const me = useActiveProfile()?.id ?? null;
  const mutation = useMutationState();
  const client = useQueryClient();
  const mine = likedBy(entries, null, me);
  const likes = likesOf(entries, null);
  const toggle = (): void => {
    mutation.run(
      async () => {
        if (mine === undefined) await addAlbumActivity(album.id, { kind: 'like' });
        else await removeAlbumActivity(album.id, mine.id);
      },
      {
        failure: mine === undefined ? 'The like was not added' : 'The like was not removed',
        label: 'photos.album_activity.like',
        onDone: () => {
          invalidateAlbumActivity(client, album.id);
        },
      },
    );
  };
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <Button
        label={mine === undefined ? 'Like' : 'Liked'}
        icon="heart"
        variant={mine === undefined ? 'tonal' : 'filled'}
        loading={mutation.busy}
        onPress={toggle}
      />
      <Text variant="footnote" tone="variant" className="tabular-nums">
        {likes === 0 ? 'No likes yet' : `${count(likes)} ${likes === 1 ? 'like' : 'likes'}`}
      </Text>
    </View>
  );
}

function CommentBox({ album }: { readonly album: DriveAlbum }): ReactNode {
  const [text, setText] = useState('');
  const mutation = useMutationState();
  const client = useQueryClient();
  const send = (): void => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    mutation.run(() => addAlbumActivity(album.id, { kind: 'comment', text: trimmed }), {
      failure: 'The comment was not sent',
      label: 'photos.album_activity.comment',
      onDone: () => {
        setText('');
        invalidateAlbumActivity(client, album.id);
      },
    });
  };
  return (
    <View className="w-full gap-2 self-stretch">
      <TextField
        label="Add a comment"
        value={text}
        multiline
        disabled={mutation.busy}
        onChange={setText}
        onSubmit={send}
      />
      <View className="flex-row justify-end">
        <Button
          label="Send"
          icon="messageCircle"
          variant="filled"
          disabled={text.trim() === ''}
          loading={mutation.busy}
          onPress={send}
        />
      </View>
    </View>
  );
}

function useRemove(albumId: string): (entry: AlbumActivity) => void {
  const mutation = useMutationState();
  const client = useQueryClient();
  return (entry) => {
    mutation.run(() => removeAlbumActivity(albumId, entry.id), {
      failure: entry.kind === 'like' ? 'The like was not removed' : 'The comment was not deleted',
      label: 'photos.album_activity.remove',
      onDone: () => {
        invalidateAlbumActivity(client, albumId);
      },
    });
  };
}

function History({ album }: { readonly album: DriveAlbum }): ReactNode {
  const query = useAlbumActivity(album.id);
  const today = useDayKey();
  const remove = useRemove(album.id);
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <ErrorState
          error={query.error}
          retry={() => {
            background(query.refetch(), 'photos.album_activity.refetch_failed');
          }}
        />
      );
    }
    return <Skeleton shape="block" className="h-32 w-full" />;
  }
  const entries = entriesOf(query.data.pages);
  const days = daysOf(entries, { today, yesterday: shiftDay(today, -1), timeZone: null });
  return (
    <View className="gap-4">
      <LikeBar album={album} entries={entries} />
      {days.length === 0 ? (
        <Text variant="body" tone="variant">
          Nothing here yet. Comments, likes and photos people add show up here.
        </Text>
      ) : (
        days.map((day) => <ActivityDayList key={day.day} day={day} onRemove={remove} />)
      )}
      {query.hasNextPage ? (
        <Button
          label="Show older activity"
          variant="text"
          loading={query.isFetchingNextPage}
          onPress={() => {
            background(query.fetchNextPage(), 'photos.album_activity.page_failed');
          }}
        />
      ) : null}
    </View>
  );
}

export function ActivityPanel({ album, open, onClose }: ActivityPanelProps): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Comments and likes"
      kind="inspector"
      footer={<CommentBox album={album} />}
    >
      <History album={album} />
    </Sheet>
  );
}
