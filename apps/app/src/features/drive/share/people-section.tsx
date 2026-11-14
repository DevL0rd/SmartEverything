import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveGrantRole, DriveItem, DriveRoot, ProfileRow } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useProfiles } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveGrantRows, useGrantRemove, useGrantSet, useViewerId } from '../data';
import type { DriveAccess } from '../model/drive-access';
import { ProfileAvatar } from '../../profiles';
import {
  EVERYONE_LINE,
  OWNER_ONLY,
  ROLE_LABEL,
  ROLE_OPTIONS,
  candidatesOf,
  peopleModeOf,
  sharedPeopleOf,
  type SharedPerson,
} from './share-model';

export interface PeopleSectionProps {
  readonly item: Pick<DriveItem, 'id' | 'name'>;
  readonly root: Pick<DriveRoot, 'ownerProfileId'>;
  readonly access: DriveAccess;
}

export function SectionTitle({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" accessibilityRole="header">
      {text}
    </Text>
  );
}

function Everyone(): ReactNode {
  const profiles = useProfiles();
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-row">
        {profiles.map((person, index) => (
          <View
            key={person.id}
            className={cn('rounded-full border-2 border-surface-raised', index > 0 && '-ml-2.5')}
          >
            <ProfileAvatar profile={person} />
          </View>
        ))}
      </View>
      <Text variant="callout" numberOfLines={2} className="min-w-0 flex-1">
        {EVERYONE_LINE}
      </Text>
    </View>
  );
}

function PersonPick({
  person,
  picked,
  disabled,
  onPick,
}: {
  readonly person: ProfileRow;
  readonly picked: boolean;
  readonly disabled: boolean;
  readonly onPick: () => void;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={`Share with ${person.name}`}
      selected={picked}
      disabled={disabled}
      onPress={onPick}
      className={cn(
        'h-12 flex-row items-center gap-2 rounded-full border pl-1 pr-4',
        picked ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-2',
      )}
    >
      <ProfileAvatar profile={person} />
      <Text variant="callout" numberOfLines={1} tone={picked ? 'primary' : 'default'}>
        {person.name}
      </Text>
    </Interactive>
  );
}

interface AddProps {
  readonly itemId: string;
  readonly candidates: readonly ProfileRow[];
  readonly live: boolean;
}

function Picker({
  candidates,
  picked,
  live,
  onPick,
}: {
  readonly candidates: readonly ProfileRow[];
  readonly picked: string | null;
  readonly live: boolean;
  readonly onPick: (profileId: string) => void;
}): ReactNode {
  return (
    <View role="list" aria-label="People in the home" className="flex-row flex-wrap gap-2">
      {candidates.map((person) => (
        <PersonPick
          key={person.id}
          person={person}
          picked={person.id === picked}
          disabled={!live}
          onPick={() => {
            onPick(person.id);
          }}
        />
      ))}
    </View>
  );
}

function AddPerson({ itemId, candidates, live }: AddProps): ReactNode {
  const [picked, setPicked] = useState<string | null>(null);
  const [role, setRole] = useState<DriveGrantRole>('view');
  const grant = useGrantSet();
  const chosen = candidates.find((person) => person.id === picked) ?? null;
  if (candidates.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        Everyone else in the home already has access.
      </Text>
    );
  }
  return (
    <View className="gap-3">
      <Picker
        candidates={candidates}
        picked={picked}
        live={live}
        onPick={(profileId) => {
          setPicked((current) => (current === profileId ? null : profileId));
        }}
      />
      <View className="flex-row flex-wrap items-center gap-2">
        <Segmented
          options={ROLE_OPTIONS}
          value={role}
          label="New person can"
          compact
          disabled={!live}
          onChange={setRole}
        />
        <Button
          label={chosen === null ? 'Share' : `Share with ${chosen.name}`}
          icon="share"
          loading={grant.busy}
          disabled={!live || chosen === null}
          onPress={() => {
            if (chosen === null) return;
            grant.run({ itemId, profileId: chosen.id, role });
            setPicked(null);
          }}
        />
      </View>
      <Problem text={grant.problem} />
    </View>
  );
}

function Problem({ text }: { readonly text: string | null }): ReactNode {
  if (text === null) return null;
  return (
    <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

function RoleControls({
  person,
  live,
}: {
  readonly person: SharedPerson<ProfileRow>;
  readonly live: boolean;
}): ReactNode {
  const change = useGrantSet();
  const remove = useGrantRemove();
  const { grant } = person;
  return (
    <>
      <View className="ml-auto flex-row items-center gap-1">
        <Segmented
          options={ROLE_OPTIONS}
          value={grant.role}
          label={`What ${person.name} can do`}
          compact
          disabled={!live || change.busy}
          onChange={(role) => {
            change.run({ itemId: grant.itemId, profileId: grant.profileId, role });
          }}
        />
        <IconButton
          icon="close"
          label={`Stop sharing with ${person.name}`}
          tone="critical"
          disabled={!live || remove.busy}
          onPress={() => {
            remove.run(grant.id);
          }}
        />
      </View>
      <View className="w-full">
        <Problem text={change.problem ?? remove.problem} />
      </View>
    </>
  );
}

function PersonRow({
  person,
  manage,
  live,
}: {
  readonly person: SharedPerson<ProfileRow>;
  readonly manage: boolean;
  readonly live: boolean;
}): ReactNode {
  return (
    <View className="min-h-row-h flex-row flex-wrap items-center gap-x-3 gap-y-1 py-1">
      <View className="min-w-36 flex-1 flex-row items-center gap-3">
        {person.profile === null ? null : <ProfileAvatar profile={person.profile} />}
        <Text variant="callout" numberOfLines={1} className="min-w-0 shrink">
          {person.name}
        </Text>
      </View>
      {manage ? (
        <RoleControls person={person} live={live} />
      ) : (
        <Badge label={ROLE_LABEL[person.grant.role]} />
      )}
    </View>
  );
}

function usePeople(itemId: string): readonly SharedPerson<ProfileRow>[] {
  const grants = useDriveGrantRows();
  const profiles = useProfiles();
  return sharedPeopleOf(grants, itemId, profiles, useViewerId());
}

export function PeopleSection({ item, root, access }: PeopleSectionProps): ReactNode {
  const mode = peopleModeOf(access);
  const people = usePeople(item.id);
  const profiles = useProfiles();
  const live = useSyncStatus().status === 'live';
  if (mode === 'everyone') {
    return (
      <View className="gap-2">
        <SectionTitle text="People" />
        <Everyone />
      </View>
    );
  }
  const manage = mode === 'manage';
  return (
    <View className="gap-3">
      <SectionTitle text="People" />
      {manage ? (
        <AddPerson
          itemId={item.id}
          candidates={candidatesOf(profiles, people, root.ownerProfileId)}
          live={live}
        />
      ) : (
        <Text variant="footnote" tone="variant">
          {OWNER_ONLY}
        </Text>
      )}
      {people.length === 0 ? null : (
        <View role="list" aria-label={`People ${item.name} is shared with`}>
          {people.map((person) => (
            <PersonRow key={person.grant.id} person={person} manage={manage} live={live} />
          ))}
        </View>
      )}
    </View>
  );
}
