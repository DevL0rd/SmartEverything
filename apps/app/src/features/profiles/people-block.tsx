import type { ReactNode } from 'react';
import { PROFILE_NAME_MAX, type ProfileRow } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import { createProfile } from '../../api/people';
import { ListRow } from '../../components/list-row';
import { Text } from '../../components/text';
import { joinParts } from '../../format/text';
import { TextEditSheet, type TextEditRequest } from '../../settings/text-edit-sheet';
import { useActiveProfile, useProfiles } from '../../store/people';
import { useIsOwner } from '../../store/selectors';
import { useNameEditor } from './name-editor';
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
  maxLength: PROFILE_NAME_MAX,
};

function PersonRow({
  profile,
  active,
}: {
  readonly profile: ProfileRow;
  readonly active: boolean;
}): ReactNode {
  const summary = summaryOf(profile, active);
  return (
    <ListRow
      title={profile.name}
      wrapTitle
      wrapSubtitle
      {...(summary === null ? {} : { subtitle: summary })}
      leading={<ProfileAvatar profile={profile} />}
      href={href.settings.profile(profile.id)}
      chevron
    />
  );
}

export function PeopleBlock(): ReactNode {
  const profiles = useProfiles();
  const active = useActiveProfile();
  const owner = useIsOwner();
  const editor = useNameEditor();
  return (
    <>
      {profiles.length === 0 ? (
        <Text variant="callout" tone="variant" className="px-4 py-3">
          No people yet.
        </Text>
      ) : null}
      {profiles.map((profile) => (
        <PersonRow key={profile.id} profile={profile} active={profile.id === active?.id} />
      ))}
      {owner ? (
        <ListRow
          title="Add a person"
          icon="plus"
          pressRef={editor.opener}
          onPress={() => {
            editor.open({
              ...ADD_PERSON,
              save: async (name) => {
                await createProfile({ name });
              },
            });
          }}
        />
      ) : null}
      <TextEditSheet request={editor.request} onClose={editor.close} />
    </>
  );
}
