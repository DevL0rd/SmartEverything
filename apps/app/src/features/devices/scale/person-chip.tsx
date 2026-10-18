import { useRef, useState, type ReactNode } from 'react';
import type { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { FilterChip } from '../../../components/filter-chip';
import { SelectPicker } from '../../../components/select-picker';
import type { Person } from './people';
import { choosePerson } from './selected-person';

export function PersonChip({
  deviceId,
  people,
  person,
}: {
  readonly deviceId: string;
  readonly people: readonly Person[];
  readonly person: Person | null;
}): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  if (person === null || people.length < 2) {
    return null;
  }
  return (
    <>
      <FilterChip
        anchorRef={ref}
        label="Person"
        value={person.profile.name}
        icon="user"
        active={false}
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label="Whose weigh-ins"
        options={people.map((entry) => ({ value: entry.profile.id, label: entry.profile.name }))}
        value={person.profile.id}
        anchor={anchor}
        onPick={(id) => {
          choosePerson(deviceId, id);
        }}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </>
  );
}
