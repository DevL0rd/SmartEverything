import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
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
import { useActiveProfile } from '../../../store/people';
import { ActivityDayList } from './activity-feed';
import { useActivityWriter } from './activity-writes';
import { removeAlbumActivity } from './api';
import { daysOf, likedBy, likesOf } from './model';
import { useAlbumActivity } from './queries';
import { removedTargets } from './shown';

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
  const { busy, write, add } = useActivityWriter(album.id);
  const mine = likedBy(entries, null, me);
  const likes = likesOf(entries, null);
  const toggle = (): void => {
    if (mine === undefined) {
      add(me, { kind: 'like' }, 'The like was not added');
      return;
    }
    write({
      event: 'photos.album_activity.unlike',
      targets: removedTargets(album.id, mine.id),
      send: () => removeAlbumActivity(album.id, mine.id),
      failure: 'The like was not removed',
    });
  };
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <Button
        label={mine === undefined ? 'Like' : 'Liked'}
        icon="heart"
        variant={mine === undefined ? 'tonal' : 'filled'}
        disabled={busy}
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
  const me = useActiveProfile()?.id ?? null;
  const { add } = useActivityWriter(album.id);
  const send = (): void => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    add(me, { kind: 'comment', text: trimmed }, 'The comment was not sent', () => {
      setText(trimmed);
    });
    setText('');
  };
  return (
    <View className="w-full gap-2 self-stretch">
      <TextField label="Add a comment" value={text} multiline onChange={setText} onSubmit={send} />
      <View className="flex-row justify-end">
        <Button
          label="Send"
          icon="messageCircle"
          variant="filled"
          disabled={text.trim() === ''}
          onPress={send}
        />
      </View>
    </View>
  );
}

function useRemove(albumId: string): (entry: AlbumActivity) => void {
  const { write } = useActivityWriter(albumId);
  return (entry) => {
    write({
      event: 'photos.album_activity.remove',
      targets: removedTargets(albumId, entry.id),
      send: () => removeAlbumActivity(albumId, entry.id),
      failure: entry.kind === 'like' ? 'The like was not removed' : 'The comment was not deleted',
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
