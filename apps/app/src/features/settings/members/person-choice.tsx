import type { ReactNode } from 'react';
import { useState } from 'react';
import type { PersonAccess } from '@smarteverything/domain';
import { createProfile } from '../../../api/people';
import { Badge } from '../../../components/badge';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useProfiles } from '../../../store/people';
import { PERSON_ROLE_LABEL, usePeopleAccess } from '../../access';
import { ProfileAvatar } from '../../profiles';

const ADD_PERSON: Omit<TextEditRequest, 'save'> = {
  title: 'Add a person',
  label: 'Name',
  initial: '',
  placeholder: 'Their first name',
  confirmLabel: 'Add',
  maxLength: 40,
};

function PersonRows({
  roles,
  chosen,
  onChoose,
}: {
  readonly roles: ReadonlyMap<string, PersonAccess['role']>;
  readonly chosen: string | null;
  readonly onChoose: (profileId: string) => void;
}): ReactNode {
  return useProfiles().map((profile) => {
    const role = roles.get(profile.id);
    return (
      <ListRow
        key={profile.id}
        title={profile.name}
        leading={<ProfileAvatar profile={profile} />}
        selected={profile.id === chosen}
        trailing={
          <>
            {role === undefined ? null : <Badge label={PERSON_ROLE_LABEL[role]} />}
            {profile.id === chosen ? <Icon name="check" tone="primary" /> : null}
          </>
        }
        onPress={() => {
          onChoose(profile.id);
        }}
      />
    );
  });
}

export function PersonChoice({
  chosen,
  onChoose,
}: {
  readonly chosen: string | null;
  readonly onChoose: (profileId: string) => void;
}): ReactNode {
  const access = usePeopleAccess();
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  if (access.isError) {
    return <ErrorState error={access.error} />;
  }
  if (access.data === undefined) {
    return <Skeleton shape="block" className="h-40" />;
  }
  const roles = new Map(access.data.map((person) => [person.profile_id, person.role]));
  return (
    <>
      <List title="Whose phone is this?" inset>
        <PersonRows roles={roles} chosen={chosen} onChoose={onChoose} />
        <ListRow
          title="Someone new"
          icon="plus"
          onPress={() => {
            setRequest({
              ...ADD_PERSON,
              save: async (name) => {
                const created = await createProfile({ name });
                onChoose(created.id);
              },
            });
          }}
        />
      </List>
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
}
