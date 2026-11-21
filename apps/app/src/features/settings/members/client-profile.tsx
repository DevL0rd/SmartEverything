import type { ReactNode } from 'react';
import type { ClientRow } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { notify } from '../../../components/toast-store';
import { writeClientProfile } from '../../../store/home-writes';
import { useProfiles } from '../../../store/people';
import { useEntityStore } from '../../../store/store-context';

export function ClientProfile({
  client,
  label,
}: {
  readonly client: ClientRow;
  readonly label: string;
}): ReactNode {
  const profiles = useProfiles();
  const store = useEntityStore();
  return (
    <Select
      label={label}
      options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
      value={client.profile_id}
      onChange={(profileId) => {
        writeClientProfile(store, client, profileId).catch((error: unknown) => {
          notify({
            message: 'The profile was not changed',
            error,
            tone: 'critical',
          });
        });
      }}
    />
  );
}
