import type { ReactNode } from 'react';
import { selectProfile } from '../../api/people';
import { SelectRow } from '../../components/rows';
import { notify } from '../../components/toast-store';
import { useActiveProfile, useProfiles } from '../../store/people';

export function ProfileSwitcher(): ReactNode {
  const profiles = useProfiles();
  const active = useActiveProfile();
  return (
    <SelectRow
      title="This app belongs to"
      subtitle="Preferences, layouts and health data follow them"
      icon="smartphone"
      options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
      value={active?.id ?? null}
      placeholder="Choose a person"
      onChange={(profileId) => {
        selectProfile(profileId).catch((error: unknown) => {
          notify({ message: 'The profile was not changed', error, tone: 'critical' });
        });
      }}
    />
  );
}
