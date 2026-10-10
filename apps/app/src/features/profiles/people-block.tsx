import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ProfileRow } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { createProfile } from '../../api/people';
import { ListRow } from '../../components/list-row';
import { joinParts } from '../../format/text';
import { TextEditSheet, type TextEditRequest } from '../../settings/text-edit-sheet';
import { useActiveProfile, useProfiles } from '../../store/people';
import { useIsOwner } from '../../store/selectors';
import { ProfileAvatar } from './profile-avatar';

function summaryOf(profile: ProfileRow, active: boolean): string | null {
  const parts = [
    active ? 'This app' : null,
    profile.height_cm === null ? null : `${String(profile.height_cm)} cm`,
    profile.sex === null || profile.birth_date === null
      ? 'Add body details for body composition'
      : null,
  ];
  const text = joinParts(parts);
  return text === '' ? null : text;
}

const ADD_PERSON: Omit<TextEditRequest, 'save'> = {
  title: 'Add a person',
  label: 'Name',
  initial: '',
  placeholder: 'Their first name',
  confirmLabel: 'Add',
  maxLength: 40,
};

export function PeopleBlock(): ReactNode {
  const profiles = useProfiles();
  const active = useActiveProfile();
  const owner = useIsOwner();
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  return (
    <>
      {profiles.map((profile) => {
        const summary = summaryOf(profile, profile.id === active?.id);
        return (
          <ListRow
            key={profile.id}
            title={profile.name}
            {...(summary === null ? {} : { subtitle: summary })}
            leading={<ProfileAvatar profile={profile} />}
            href={href.settings.profile(profile.id)}
            chevron
          />
        );
      })}
      {owner ? (
        <ListRow
          title="Add a person"
          icon="plus"
          onPress={() => {
            setRequest({
              ...ADD_PERSON,
              save: async (name) => {
                await createProfile({ name });
              },
            });
          }}
        />
      ) : null}
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
}
