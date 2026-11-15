import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { AlbumMemberRole, DriveAlbum, ProfileRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useMutationState } from '../../../store/mutation';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { ProfileAvatar } from '../../profiles';
import { removeAlbumMember, setAlbumMembers } from './api';
import { ROLE_LABEL } from './model';
import { invalidateSharing } from './queries';

const ROLE_OPTIONS = [
  { value: 'contributor', label: 'Can add photos' },
  { value: 'viewer', label: 'Can view' },
] as const;

export interface MembersSheetProps {
  readonly album: DriveAlbum;
  readonly memberIds: readonly string[];
  readonly owner: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function outsidersOf(
  profiles: readonly ProfileRow[],
  album: DriveAlbum,
  memberIds: readonly string[],
): readonly ProfileRow[] {
  return profiles.filter(
    (profile) => profile.id !== album.ownerProfileId && !memberIds.includes(profile.id),
  );
}

function Member({
  album,
  profile,
  owner,
}: {
  readonly album: DriveAlbum;
  readonly profile: ProfileRow;
  readonly owner: boolean;
}): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  const remove = (): void => {
    background(
      confirm({
        title: `Remove ${profile.name} from ${album.title}?`,
        body: 'They can no longer open the album, and the photos they added leave it.',
        confirmLabel: 'Remove',
        tone: 'destructive',
      }).then((accepted) => {
        if (!accepted) return;
        mutation.run(() => removeAlbumMember(album.id, profile.id), {
          failure: `${profile.name} was not removed`,
          label: 'photos.album_member.remove',
          onDone: () => {
            invalidateSharing(client);
          },
        });
      }),
      'photos.album_member.remove_confirm_failed',
    );
  };
  return (
    <ListRow
      title={profile.name}
      leading={<ProfileAvatar profile={profile} />}
      trailing={
        owner ? (
          <IconButton
            icon="x"
            label={`Remove ${profile.name}`}
            disabled={mutation.busy}
            onPress={remove}
          />
        ) : undefined
      }
    />
  );
}

function Checklist({
  people,
  chosen,
  onToggle,
}: {
  readonly people: readonly ProfileRow[];
  readonly chosen: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
}): ReactNode {
  return (
    <View className="gap-1">
      {people.map((profile) => (
        <ListRow
          key={profile.id}
          title={profile.name}
          leading={<ProfileAvatar profile={profile} />}
          role="checkbox"
          checked={chosen.has(profile.id)}
          onPress={() => {
            onToggle(profile.id);
          }}
        />
      ))}
    </View>
  );
}

function Invite({
  album,
  people,
}: {
  readonly album: DriveAlbum;
  readonly people: readonly ProfileRow[];
}): ReactNode {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [role, setRole] = useState<AlbumMemberRole>('contributor');
  if (people.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        Everyone at home is already in this album.
      </Text>
    );
  }
  const toggle = (id: string): void => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    setChosen(next);
  };
  return (
    <View className="gap-3">
      <Text variant="label">Add people</Text>
      <Checklist people={people} chosen={chosen} onToggle={toggle} />
      <Segmented
        options={ROLE_OPTIONS}
        value={role}
        label="What they can do"
        fill
        onChange={setRole}
      />
      <AddButton
        album={album}
        chosen={chosen}
        role={role}
        onAdded={() => {
          setChosen(new Set());
        }}
      />
    </View>
  );
}

function AddButton({
  album,
  chosen,
  role,
  onAdded,
}: {
  readonly album: DriveAlbum;
  readonly chosen: ReadonlySet<string>;
  readonly role: AlbumMemberRole;
  readonly onAdded: () => void;
}): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  return (
    <View className="flex-row justify-end">
      <Button
        label={chosen.size === 0 ? 'Add' : `Add ${String(chosen.size)}`}
        icon="plus"
        variant="filled"
        disabled={chosen.size === 0}
        loading={mutation.busy}
        onPress={() => {
          const members = [...chosen].map((profileId) => ({ profileId, role }));
          mutation.run(() => setAlbumMembers(album.id, { members }), {
            failure: 'People were not added',
            label: 'photos.album_member.add',
            onDone: () => {
              onAdded();
              invalidateSharing(client);
            },
          });
        }}
      />
    </View>
  );
}

export function MembersSheet({
  album,
  memberIds,
  owner,
  open,
  onClose,
}: MembersSheetProps): ReactNode {
  const profiles = useProfiles();
  const me = useActiveProfile()?.id ?? null;
  const albumOwner = profiles.find((profile) => profile.id === album.ownerProfileId);
  const members = memberIds.flatMap((id) => profiles.filter((profile) => profile.id === id));
  return (
    <Sheet open={open} onClose={onClose} title={owner ? 'People in this album' : 'In this album'}>
      <View className="gap-section-gap">
        <View className="gap-1">
          {albumOwner === undefined ? null : (
            <ListRow
              title={albumOwner.id === me ? `${albumOwner.name} (you)` : albumOwner.name}
              leading={<ProfileAvatar profile={albumOwner} />}
              value={ROLE_LABEL.owner}
            />
          )}
          {members.map((profile) => (
            <Member key={profile.id} album={album} profile={profile} owner={owner} />
          ))}
        </View>
        {owner ? <Invite album={album} people={outsidersOf(profiles, album, memberIds)} /> : null}
      </View>
    </Sheet>
  );
}
