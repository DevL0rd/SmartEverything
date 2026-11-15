import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedAlbum } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Cover } from '../places/cover';
import { itemsText } from '../model/media-text';
import { MemberAvatars } from './member-avatars';
import { ROLE_LABEL, membersLine, unreadText } from './model';

export function sharedAlbumLabel(album: SharedAlbum): string {
  const unread = unreadText(album.unread);
  return [
    `Shared album ${album.title}`,
    itemsText(album.itemCount),
    membersLine(album.memberIds),
    ROLE_LABEL[album.role],
    ...(unread === null ? [] : [unread]),
  ].join(', ');
}

function UnreadDot({ unread }: { readonly unread: number }): ReactNode {
  const text = unreadText(unread);
  if (text === null) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="size-2 rounded-full bg-primary" />
      <Text variant="caption" tone="primary" className="tabular-nums font-sans-medium">
        {text}
      </Text>
    </View>
  );
}

export function SharedAlbumCard({ album }: { readonly album: SharedAlbum }): ReactNode {
  const people = [
    album.ownerProfileId,
    ...album.memberIds.filter((id) => id !== album.ownerProfileId),
  ];
  return (
    <Interactive
      href={href.photosAlbum(album.albumId)}
      label={sharedAlbumLabel(album)}
      className="min-h-28 flex-row overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1"
      layerClassName="rounded-lg"
    >
      <Cover itemId={album.coverItemId} className="w-36 self-stretch rounded-none" />
      <View className="min-w-0 flex-1 justify-between gap-2 px-4 py-3">
        <View className="gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
              {album.title}
            </Text>
            <UnreadDot unread={album.unread} />
          </View>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
            {`${itemsText(album.itemCount)} · ${membersLine(album.memberIds)}`}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <MemberAvatars ids={people} shown={5} />
          <Badge label={ROLE_LABEL[album.role]} icon={album.role === 'viewer' ? 'eye' : 'users'} />
        </View>
      </View>
    </Interactive>
  );
}
