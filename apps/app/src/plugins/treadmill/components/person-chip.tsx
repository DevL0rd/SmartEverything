import type { ReactNode } from 'react';
import { ChoiceChip } from '../../../components/choice-chip';
import { useProfiles } from '../../../store/people';
import { useIsOwner } from '../../../store/selectors';

export function PersonChip({
  personId,
  onChange,
}: {
  readonly personId: string;
  readonly onChange: (personId: string) => void;
}): ReactNode {
  const profiles = useProfiles();
  const owner = useIsOwner();
  if (!owner || profiles.length < 2) {
    return null;
  }
  return (
    <ChoiceChip
      label="Person"
      icon="user"
      all=""
      value={personId}
      options={[
        { value: '', label: 'Me' },
        ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
      ]}
      onChange={onChange}
    />
  );
}
