import type { ReactNode } from 'react';
import { SelectRow } from '../../../components/rows';
import { useProfiles } from '../../../store/people';
import { usePeopleAccess } from '../../access';

const NOBODY = 'nobody';

export function HomePersonRow({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (profileId: string | null) => void;
}): ReactNode {
  const profiles = useProfiles();
  const access = usePeopleAccess().data ?? [];
  const limited = new Set(
    access.filter((entry) => entry.role !== 'owner').map((entry) => entry.profile_id),
  );
  const options = [
    { value: NOBODY, label: 'Nobody, a limited guest' },
    ...profiles
      .filter((profile) => limited.has(profile.id))
      .map((profile) => ({ value: profile.id, label: profile.name })),
  ];
  return (
    <SelectRow
      title="Which person in the home"
      subtitle="Their messages run with that person's limits and chats"
      wrapSubtitle
      icon="user"
      options={options}
      value={value ?? NOBODY}
      onChange={(next) => {
        onChange(next === NOBODY ? null : next);
      }}
    />
  );
}
