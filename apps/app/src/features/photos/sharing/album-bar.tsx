import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DriveAlbum, DriveItem, SharedAlbumMember } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import type { IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import type { MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useMutationState } from '../../../store/mutation';
import { useActiveProfile } from '../../../store/people';
import { ActivityPanel } from './activity-panel';
import { AddPhotosSheet } from './add-photos-sheet';
import { joinAlbum, leaveAlbum } from './api';
import { Contributors } from './contributors';
import { AlbumLinkSheet } from './link-sheet';
import { MemberAvatars } from './member-avatars';
import { MembersSheet } from './members-sheet';
import { canAddPhotos, membersLine, roleOf, unreadText, type AlbumRole } from './model';
import { invalidateSharing, usePhotoSharing } from './queries';

export type AlbumOpened = 'members' | 'link' | 'activity' | 'add' | null;

type Opened = AlbumOpened;

type Run = ReturnType<typeof useMutationState>['run'];

function declineInvite(album: DriveAlbum, run: Run, refresh: () => void): void {
  run(() => leaveAlbum(album.id), {
    failure: 'The invitation was not declined',
    label: 'photos.album.decline',
    onDone: () => {
      refresh();
      router.replace(href.photosPage('sharing'));
    },
  });
}

function JoinCard({ album }: { readonly album: DriveAlbum }): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  const refresh = (): void => {
    invalidateSharing(client);
  };
  return (
    <View className="flex-row flex-wrap items-center gap-3 rounded-lg bg-primary-container/40 px-4 py-3">
      <Text variant="body" className="min-w-48 flex-1">
        {`You were invited to ${album.title}. Join to add photos, comment and get its activity.`}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label="Decline"
          variant="text"
          disabled={mutation.busy}
          onPress={() => {
            declineInvite(album, mutation.run, refresh);
          }}
        />
        <Button
          label="Join album"
          icon="check"
          variant="filled"
          loading={mutation.busy}
          onPress={() => {
            mutation.run(() => joinAlbum(album.id), {
              failure: 'You did not join the album',
              label: 'photos.album.join',
              onDone: refresh,
            });
          }}
        />
      </View>
    </View>
  );
}

function leave(album: DriveAlbum, run: Run, refresh: () => void): void {
  background(
    confirm({
      title: `Leave ${album.title}?`,
      body: 'You can no longer open it, and the photos you added leave the album. They stay in your library.',
      confirmLabel: 'Leave album',
      tone: 'destructive',
    }).then((accepted) => {
      if (!accepted) return;
      run(() => leaveAlbum(album.id), {
        failure: 'You did not leave the album',
        label: 'photos.album.leave',
        onDone: () => {
          refresh();
          router.replace(href.photosPage('sharing'));
        },
      });
    }),
    'photos.album.leave_confirm_failed',
  );
}

export function useLeaveAlbum(album: DriveAlbum): { readonly busy: boolean; readonly leave: () => void } {
  const mutation = useMutationState();
  const client = useQueryClient();
  return {
    busy: mutation.busy,
    leave: () => {
      leave(album, mutation.run, () => {
        invalidateSharing(client);
      });
    },
  };
}

interface ActionSpec {
  readonly key: Exclude<Opened, null>;
  readonly label: string;
  readonly icon: IconName;
  readonly primary: boolean;
  readonly menu: boolean;
}

export function actionSpecsOf(
  role: AlbumRole,
  unread: number,
  shared: boolean,
): readonly ActionSpec[] {
  const owner = role === 'owner';
  const comments = unreadText(unread);
  const specs: (ActionSpec | null)[] = [
    canAddPhotos(role)
      ? { key: 'add', label: 'Add photos', icon: 'plus', primary: true, menu: false }
      : null,
    {
      key: 'members',
      label: owner ? 'Add people' : 'People',
      icon: 'users',
      primary: false,
      menu: false,
    },
    owner ? { key: 'link', label: 'Link', icon: 'link', primary: false, menu: true } : null,
    shared
      ? {
          key: 'activity',
          label: comments === null ? 'Comments and likes' : `Comments and likes · ${comments}`,
          icon: 'messageCircle',
          primary: false,
          menu: true,
        }
      : null,
  ];
  return specs.filter((spec): spec is ActionSpec => spec !== null);
}

export interface AlbumShare {
  readonly role: AlbumRole | null;
  readonly members: readonly SharedAlbumMember[];
  readonly memberIds: readonly string[];
  readonly invited: boolean;
  readonly unread: number;
}

function specsOfShare(share: AlbumShare): readonly ActionSpec[] {
  return share.role === null || share.invited
    ? []
    : actionSpecsOf(share.role, share.unread, share.memberIds.length > 0);
}

export function albumMenuOf(
  album: DriveAlbum,
  share: AlbumShare,
  onOpen: (opened: Opened) => void,
  onLeave: () => void,
): readonly MenuItem[] {
  if (!sharesAlbum(album)) return [];
  const opens: MenuItem[] = specsOfShare(share)
    .filter((spec) => spec.menu)
    .map((spec) => ({
      id: spec.key,
      label: spec.label,
      icon: spec.icon,
      onPress: () => {
        onOpen(spec.key);
      },
    }));
  const leaving: MenuItem[] =
    share.role === null || share.role === 'owner' || share.invited
      ? []
      : [{ id: 'leave', label: 'Leave album', icon: 'signOut', destructive: true, onPress: onLeave }];
  return [...opens, ...leaving];
}

function Actions({
  album,
  share,
  compact,
  onOpen,
}: {
  readonly album: DriveAlbum;
  readonly share: AlbumShare;
  readonly compact: boolean;
  readonly onOpen: (opened: Opened) => void;
}): ReactNode {
  const leaving = useLeaveAlbum(album);
  const specs = specsOfShare(share).filter((spec) => !compact || !spec.menu);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {specs.map((spec) => (
        <Button
          key={spec.key}
          label={spec.label}
          icon={spec.icon}
          variant={spec.primary ? 'filled' : 'tonal'}
          onPress={() => {
            onOpen(spec.key);
          }}
        />
      ))}
      {compact || share.role === 'owner' ? null : (
        <Button
          label="Leave"
          icon="signOut"
          variant="text"
          loading={leaving.busy}
          onPress={leaving.leave}
        />
      )}
    </View>
  );
}

function PeopleLine({
  album,
  memberIds,
  onOpen,
}: {
  readonly album: DriveAlbum;
  readonly memberIds: readonly string[];
  readonly onOpen: () => void;
}): ReactNode {
  const ids = album.ownerProfileId === null ? memberIds : [album.ownerProfileId, ...memberIds];
  return (
    <Interactive
      label={`People in this album: ${membersLine(memberIds)}`}
      onPress={onOpen}
      className="min-h-11 flex-row items-center gap-3 self-start rounded-sm"
      layerClassName="rounded-sm"
    >
      <MemberAvatars ids={ids} shown={6} />
      <Text variant="footnote" tone="variant" className="tabular-nums">
        {memberIds.length === 0 ? 'Not shared yet' : `Shared · ${membersLine(memberIds)}`}
      </Text>
    </Interactive>
  );
}

export function AlbumSheets({
  album,
  share,
  opened,
  onClose,
}: {
  readonly album: DriveAlbum;
  readonly share: AlbumShare;
  readonly opened: Opened;
  readonly onClose: () => void;
}): ReactNode {
  if (!sharesAlbum(album) || share.role === null) return null;
  const owner = share.role === 'owner';
  return (
    <>
      <MembersSheet
        album={album}
        members={share.members}
        owner={owner}
        open={opened === 'members'}
        onClose={onClose}
      />
      {owner ? <AlbumLinkSheet album={album} open={opened === 'link'} onClose={onClose} /> : null}
      <ActivityPanel album={album} open={opened === 'activity'} onClose={onClose} />
      {canAddPhotos(share.role) ? (
        <AddPhotosSheet album={album} open={opened === 'add'} onClose={onClose} />
      ) : null}
    </>
  );
}

export function sharesAlbum(album: DriveAlbum): boolean {
  return album.kind === 'manual' && album.scope === 'person';
}

export function useAlbumShare(album: DriveAlbum): AlbumShare {
  const me = useActiveProfile()?.id ?? null;
  const shared = usePhotoSharing().data?.albums.find((entry) => entry.albumId === album.id);
  const members = shared?.members ?? [];
  return {
    role: roleOf(album, shared, me),
    members,
    memberIds: members.map((member) => member.profileId),
    invited: shared?.joined === false,
    unread: shared?.unread ?? 0,
  };
}

export function canAddToAlbum(album: DriveAlbum, share: AlbumShare): boolean {
  return sharesAlbum(album) && !share.invited && canAddPhotos(share.role);
}

export interface AlbumSharingBarProps {
  readonly album: DriveAlbum;
  readonly items: readonly DriveItem[];
  readonly complete: boolean;
  readonly share: AlbumShare;
  readonly compact: boolean;
  readonly onOpen: (opened: Opened) => void;
}

export function AlbumSharingBar({
  album,
  items,
  complete,
  share,
  compact,
  onOpen,
}: AlbumSharingBarProps): ReactNode {
  if (!sharesAlbum(album) || share.role === null) return null;
  if (share.invited) return <JoinCard album={album} />;
  return (
    <View className="gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 px-4 py-3">
      <PeopleLine
        album={album}
        memberIds={share.memberIds}
        onOpen={() => {
          onOpen('members');
        }}
      />
      {share.memberIds.length === 0 ? null : <Contributors items={items} complete={complete} />}
      <Actions album={album} share={share} compact={compact} onOpen={onOpen} />
    </View>
  );
}
