import type { ReactNode } from 'react';
import type { ClientRow } from '@smarteverything/domain';
import { setClientProfile } from '../../../api/settings';
import { Select } from '../../../components/select';
import { notify } from '../../../components/toast-store';
import { useProfiles } from '../../../store/people';

export function ClientProfile({
  client,
  label,
}: {
  readonly client: ClientRow;
  readonly label: string;
}): ReactNode {
  const profiles = useProfiles();
  return (
    <Select
      label={label}
      options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
      value={client.profile_id}
      onChange={(profileId) => {
        setClientProfile(client.id, profileId).catch((error: unknown) => {
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
