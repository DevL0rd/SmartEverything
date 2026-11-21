import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
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
import { ListRow } from '../../../components/list-row';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useShownWriter } from '../../../queries/shown-writer';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { ProfileAvatar } from '../../profiles';
import { removeAlbumMember, setAlbumMembers } from './api';
import { ROLE_LABEL } from './model';
import { invalidateSharing } from './queries';
import { memberRemovedTargets, membersTargets } from './shown';

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

function useRoleItems(
  album: DriveAlbum,
  profile: ProfileRow,
  role: AlbumMemberRole,
): { readonly busy: boolean; readonly roles: readonly MenuItem[] } {
  const { busy, write } = useShownWriter(invalidateSharing);
  const roles = ROLE_OPTIONS.map((option) => ({
    id: option.value,
    label: option.label,
    selected: option.value === role,
    onPress: (): void => {
      if (option.value === role) return;
      const members = [{ profileId: profile.id, role: option.value }];
      write({
        event: 'photos.album_member.role',
        targets: membersTargets(album, members),
        send: () => setAlbumMembers(album.id, { members }),
        failure: `${profile.name}’s role did not change`,
      });
    },
  }));
  return { busy, roles };
}

function RolePicker({
  album,
  profile,
  role,
  disabled,
  onRemove,
}: {
  readonly album: DriveAlbum;
  readonly profile: ProfileRow;
  readonly role: AlbumMemberRole;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}): ReactNode {
  const { busy, roles } = useRoleItems(album, profile, role);
  const { ref, open, menu } = useAnchoredMenu(
    [
      ...roles,
      {
        id: 'remove',
        label: `Remove ${profile.name}`,
        icon: 'x',
        destructive: true,
        group: 'remove',
        onPress: onRemove,
      },
    ],
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
        disabled={disabled || busy}
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
  const { busy, remove } = useRemoveMember(album, profile);
  return (
    <ListRow
      title={youName(profile, me)}
      leading={<ProfileAvatar profile={profile} />}
      {...(owner
        ? {
            trailing: (
              <RolePicker
                album={album}
                profile={profile}
                role={role}
                disabled={busy}
                onRemove={remove}
              />
            ),
          }
        : { value: ROLE_LABEL[role] })}
    />
  );
}

function useRemoveMember(
  album: DriveAlbum,
  profile: ProfileRow,
): { readonly busy: boolean; readonly remove: () => void } {
  const { busy, write } = useShownWriter(invalidateSharing);
  const remove = (): void => {
    background(
      confirm({
        title: `Remove ${profile.name} from ${album.title}?`,
        body: 'They can no longer open the album, and the photos they added leave it.',
        confirmLabel: 'Remove',
        tone: 'destructive',
      }).then((accepted) => {
        if (!accepted) return;
        write({
          event: 'photos.album_member.remove',
          targets: memberRemovedTargets(album.id, profile.id),
          send: () => removeAlbumMember(album.id, profile.id),
          failure: `${profile.name} was not removed`,
        });
      }),
      'photos.album_member.remove_confirm_failed',
    );
  };
  return { busy, remove };
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
  const { busy, write } = useShownWriter(invalidateSharing);
  return (
    <View className="flex-1 flex-row justify-end">
      <Button
        label={chosen.size === 0 ? 'Add' : `Add ${String(chosen.size)}`}
        icon="plus"
        variant="filled"
        disabled={chosen.size === 0 || busy}
        onPress={() => {
          const members = [...chosen].map((profileId) => ({ profileId, role }));
          write({
            event: 'photos.album_member.add',
            targets: membersTargets(album, members),
            send: () => setAlbumMembers(album.id, { members }),
            failure: 'People were not added',
          });
          onAdded();
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
