import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AlbumActivity } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { ProfileAvatar } from '../../profiles';
import { Cover } from '../places/cover';
import { ACTIVITY_ICON, activityLine, nameOf, type ActivityAlbum, type ActivityDay } from './model';

export interface ActivityRowProps {
  readonly entry: AlbumActivity;
  readonly onRemove?: (entry: AlbumActivity) => void;
}

function Who({ profileId }: { readonly profileId: string }): ReactNode {
  const profile = useProfiles().find((candidate) => candidate.id === profileId);
  if (profile === undefined) {
    return (
      <View className="size-8 items-center justify-center rounded-full bg-surface-3">
        <Icon name="user" size={16} tone="variant" />
      </View>
    );
  }
  return <ProfileAvatar profile={profile} />;
}

function Thumb({ entry }: { readonly entry: AlbumActivity }): ReactNode {
  return (
    <View className="h-11 w-16">
      {entry.itemId === null ? null : (
        <Interactive
          href={href.photosItem(entry.itemId, { albumId: entry.albumId })}
          label="Open the photo"
          className="h-11 w-16 overflow-hidden rounded-sm"
          layerClassName="rounded-sm"
        >
          <Cover itemId={entry.itemId} className="h-full w-full rounded-none" />
        </Interactive>
      )}
    </View>
  );
}

function RemoveSlot({
  entry,
  own,
  onRemove,
}: {
  readonly entry: AlbumActivity;
  readonly own: boolean;
  readonly onRemove: (entry: AlbumActivity) => void;
}): ReactNode {
  return (
    <View className="size-11 items-center justify-center">
      {own ? (
        <IconButton
          icon="trash"
          label="Delete your comment"
          onPress={() => {
            onRemove(entry);
          }}
        />
      ) : null}
    </View>
  );
}

export function ActivityRow({ entry, onRemove }: ActivityRowProps): ReactNode {
  const people = useProfiles();
  const me = useActiveProfile()?.id ?? null;
  const who = nameOf(entry.profileId, people, me);
  const own = entry.profileId === me && entry.kind === 'comment';
  return (
    <View className="min-h-12 flex-row items-start gap-3 py-1.5">
      <Who profileId={entry.profileId} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="min-h-8 flex-row items-center gap-1.5">
          <Icon name={ACTIVITY_ICON[entry.kind]} size={14} tone="variant" />
          <Text variant="footnote" numberOfLines={2} className="min-w-0 flex-1">
            {activityLine(entry, who)}
          </Text>
        </View>
        {entry.text === null ? null : (
          <Text variant="body" selectable className="rounded-md bg-surface-2 px-3 py-2">
            {entry.text}
          </Text>
        )}
      </View>
      <View className="min-h-8 justify-center">
        <Text variant="caption" tone="variant" className="tabular-nums">
          {clock(entry.createdAt)}
        </Text>
      </View>
      <Thumb entry={entry} />
      {onRemove === undefined ? null : <RemoveSlot entry={entry} own={own} onRemove={onRemove} />}
    </View>
  );
}

export function ActivityDayList({
  day,
  onRemove,
}: {
  readonly day: ActivityDay;
  readonly onRemove?: (entry: AlbumActivity) => void;
}): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant" className="pt-1 font-sans-medium">
        {day.label}
      </Text>
      {day.entries.map((entry) => (
        <ActivityRow
          key={entry.id}
          entry={entry}
          {...(onRemove === undefined ? {} : { onRemove })}
        />
      ))}
    </View>
  );
}

export function ActivityFeed({ albums }: { readonly albums: readonly ActivityAlbum[] }): ReactNode {
  return (
    <View className="gap-section-gap">
      {albums.map((album) => (
        <View
          key={album.albumId}
          className="gap-2 rounded-lg border-hairline border-outline-variant bg-surface-1 px-4 py-3"
        >
          <Interactive
            href={href.photosAlbum(album.albumId)}
            role="link"
            label={`Open ${album.title}`}
            className="min-h-11 flex-row items-center gap-2 rounded-sm"
            layerClassName="rounded-sm"
          >
            <Icon name="layers" size={16} tone="variant" />
            <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
              {album.title}
            </Text>
            <Icon name="chevronRight" size={16} tone="variant" />
          </Interactive>
          {album.days.map((day) => (
            <ActivityDayList key={day.day} day={day} />
          ))}
        </View>
      ))}
    </View>
  );
}
