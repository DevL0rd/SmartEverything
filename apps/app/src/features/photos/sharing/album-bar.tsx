import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import type { IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
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

type Opened = 'members' | 'link' | 'activity' | 'add' | null;

function JoinCard({ album }: { readonly album: DriveAlbum }): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  return (
    <View className="flex-row flex-wrap items-center gap-3 rounded-lg bg-primary-container/40 px-4 py-3">
      <Text variant="body" className="min-w-48 flex-1">
        {`You were invited to ${album.title}. Join to add photos, comment and get its activity.`}
      </Text>
      <Button
        label="Join album"
        icon="check"
        variant="filled"
        loading={mutation.busy}
        onPress={() => {
          mutation.run(() => joinAlbum(album.id), {
            failure: 'You did not join the album',
            label: 'photos.album.join',
            onDone: () => {
              invalidateSharing(client);
            },
          });
        }}
      />
    </View>
  );
}

function leave(
  album: DriveAlbum,
  run: ReturnType<typeof useMutationState>['run'],
  refresh: () => void,
): void {
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

interface ActionsProps {
  readonly album: DriveAlbum;
  readonly role: AlbumRole;
  readonly unread: number;
  readonly onOpen: (opened: Opened) => void;
}

interface ActionSpec {
  readonly key: Exclude<Opened, null>;
  readonly label: string;
  readonly icon: IconName;
  readonly primary: boolean;
}

export function actionSpecsOf(role: AlbumRole, unread: number): readonly ActionSpec[] {
  const owner = role === 'owner';
  const comments = unreadText(unread);
  const specs: (ActionSpec | null)[] = [
    canAddPhotos(role) ? { key: 'add', label: 'Add photos', icon: 'plus', primary: true } : null,
    { key: 'members', label: owner ? 'Add people' : 'People', icon: 'users', primary: false },
    owner ? { key: 'link', label: 'Link', icon: 'link', primary: false } : null,
    {
      key: 'activity',
      label: comments === null ? 'Comments and likes' : `Comments and likes · ${comments}`,
      icon: 'messageCircle',
      primary: false,
    },
  ];
  return specs.filter((spec): spec is ActionSpec => spec !== null);
}

function LeaveButton({ album }: { readonly album: DriveAlbum }): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  return (
    <View className="flex-1 flex-row justify-end">
      <Button
        label="Leave"
        icon="signOut"
        variant="text"
        loading={mutation.busy}
        onPress={() => {
          leave(album, mutation.run, () => {
            invalidateSharing(client);
          });
        }}
      />
    </View>
  );
}

function Actions({ album, role, unread, onOpen }: ActionsProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {actionSpecsOf(role, unread).map((spec) => (
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
      {role === 'owner' ? null : <LeaveButton album={album} />}
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

export interface AlbumSharingBarProps {
  readonly album: DriveAlbum;
  readonly items: readonly DriveItem[];
  readonly complete: boolean;
}

function Sheets({
  album,
  role,
  memberIds,
  opened,
  onClose,
}: {
  readonly album: DriveAlbum;
  readonly role: AlbumRole;
  readonly memberIds: readonly string[];
  readonly opened: Opened;
  readonly onClose: () => void;
}): ReactNode {
  const owner = role === 'owner';
  return (
    <>
      <MembersSheet
        album={album}
        memberIds={memberIds}
        owner={owner}
        open={opened === 'members'}
        onClose={onClose}
      />
      {owner ? <AlbumLinkSheet album={album} open={opened === 'link'} onClose={onClose} /> : null}
      <ActivityPanel album={album} open={opened === 'activity'} onClose={onClose} />
      {canAddPhotos(role) ? (
        <AddPhotosSheet album={album} open={opened === 'add'} onClose={onClose} />
      ) : null}
    </>
  );
}

export function sharesAlbum(album: DriveAlbum): boolean {
  return album.kind === 'manual' && album.scope === 'person';
}

interface AlbumShare {
  readonly role: AlbumRole | null;
  readonly memberIds: readonly string[];
  readonly invited: boolean;
  readonly unread: number;
}

function useAlbumShare(album: DriveAlbum): AlbumShare {
  const me = useActiveProfile()?.id ?? null;
  const shared = usePhotoSharing().data?.albums.find((entry) => entry.albumId === album.id);
  return {
    role: roleOf(album, shared, me),
    memberIds: shared?.memberIds ?? [],
    invited: shared?.joined === false,
    unread: shared?.unread ?? 0,
  };
}

export function AlbumSharingBar({ album, items, complete }: AlbumSharingBarProps): ReactNode {
  const { role, memberIds, invited, unread } = useAlbumShare(album);
  const [opened, setOpened] = useState<Opened>(null);
  if (!sharesAlbum(album) || role === null) return null;
  return (
    <View className="gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 px-4 py-3">
      {invited ? <JoinCard album={album} /> : null}
      <PeopleLine
        album={album}
        memberIds={memberIds}
        onOpen={() => {
          setOpened('members');
        }}
      />
      {memberIds.length === 0 ? null : <Contributors items={items} complete={complete} />}
      <Actions album={album} role={role} unread={unread} onOpen={setOpened} />
      <Sheets
        album={album}
        role={role}
        memberIds={memberIds}
        opened={opened}
        onClose={() => {
          setOpened(null);
        }}
      />
    </View>
  );
}
