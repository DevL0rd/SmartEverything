import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AlbumMemberRole,
  DriveAlbum,
  ProfileRow,
  SharedAlbumMember,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { CheckboxMark } from '../../../components/checkbox';
import { confirm } from '../../../components/confirm-store';
import { FlatChoice } from '../../../components/flat-choice';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { useAnchoredMenu } from '../../../components/menu';
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

export const MEMBERS_TITLE = 'People in this album';

export interface MembersSheetProps {
  readonly album: DriveAlbum;
  readonly members: readonly SharedAlbumMember[];
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

export function youName(profile: ProfileRow, me: string | null): string {
  return profile.id === me ? `${profile.name} (you)` : profile.name;
}

function RolePicker({
  album,
  profile,
  role,
  disabled,
}: {
  readonly album: DriveAlbum;
  readonly profile: ProfileRow;
  readonly role: AlbumMemberRole;
  readonly disabled: boolean;
}): ReactNode {
  const mutation = useMutationState();
  const client = useQueryClient();
  const { ref, open, menu } = useAnchoredMenu(
    ROLE_OPTIONS.map((option) => ({
      id: option.value,
      label: option.label,
      selected: option.value === role,
      onPress: () => {
        if (option.value === role) return;
        mutation.run(
          () =>
            setAlbumMembers(album.id, { members: [{ profileId: profile.id, role: option.value }] }),
          {
            failure: `${profile.name}’s role did not change`,
            label: 'photos.album_member.role',
            onDone: () => {
              invalidateSharing(client);
            },
          },
        );
      },
    })),
    `What ${profile.name} can do`,
  );
  return (
    <View ref={ref} collapsable={false}>
      <FlatChoice
        label={ROLE_LABEL[role]}
        spoken={`${profile.name}: ${ROLE_LABEL[role]}, change`}
        trailing="chevronDown"
        menu
        active={false}
        disabled={disabled || mutation.busy}
        onPress={open}
      />
      {menu}
    </View>
  );
}

function Member({
  album,
  profile,
  role,
  owner,
  me,
}: {
  readonly album: DriveAlbum;
  readonly profile: ProfileRow;
  readonly role: AlbumMemberRole;
  readonly owner: boolean;
  readonly me: string | null;
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
      title={youName(profile, me)}
      leading={<ProfileAvatar profile={profile} />}
      {...(owner
        ? {
            trailing: (
              <View className="flex-row items-center">
                <RolePicker
                  album={album}
                  profile={profile}
                  role={role}
                  disabled={mutation.busy}
                />
                <IconButton
                  icon="x"
                  label={`Remove ${profile.name}`}
                  disabled={mutation.busy}
                  onPress={remove}
                />
              </View>
            ),
          }
        : { value: ROLE_LABEL[role] })}
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
          trailing={<CheckboxMark checked={chosen.has(profile.id)} />}
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
    <View className="flex-1 flex-row justify-end">
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
  members,
  owner,
  open,
  onClose,
}: MembersSheetProps): ReactNode {
  const profiles = useProfiles();
  const me = useActiveProfile()?.id ?? null;
  const albumOwner = profiles.find((profile) => profile.id === album.ownerProfileId);
  const rows = members.flatMap((member) => {
    const profile = profiles.find((candidate) => candidate.id === member.profileId);
    return profile === undefined ? [] : [{ profile, role: member.role }];
  });
  const memberIds = members.map((member) => member.profileId);
  return (
    <Sheet open={open} onClose={onClose} title={MEMBERS_TITLE}>
      <View className="gap-section-gap">
        <View className="gap-1">
          {albumOwner === undefined ? null : (
            <ListRow
              title={youName(albumOwner, me)}
              leading={<ProfileAvatar profile={albumOwner} />}
              value={ROLE_LABEL.owner}
            />
          )}
          {rows.map(({ profile, role }) => (
            <Member
              key={profile.id}
              album={album}
              profile={profile}
              role={role}
              owner={owner}
              me={me}
            />
          ))}
        </View>
        {owner ? <Invite album={album} people={outsidersOf(profiles, album, memberIds)} /> : null}
      </View>
    </Sheet>
  );
}
