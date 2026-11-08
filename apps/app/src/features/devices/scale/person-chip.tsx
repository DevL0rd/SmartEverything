import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import { IconButton } from '../../../components/icon-button';
import { SelectPicker } from '../../../components/select-picker';
import { useInActionBand } from '../../../components/widget-board/band-context';
import type { Person } from './people';
import { choosePerson } from './selected-person';

function Trigger({
  anchorRef,
  name,
  open,
  expanded,
  compact,
}: {
  readonly anchorRef: RefObject<View | null>;
  readonly name: string;
  readonly open: () => void;
  readonly expanded: boolean;
  readonly compact: boolean;
}): ReactNode {
  const banded = useInActionBand();
  const spoken = `Person: ${name}`;
  if (compact) {
    return (
      <View ref={anchorRef} collapsable={false}>
        <IconButton icon="user" label={spoken} onPress={open} />
      </View>
    );
  }
  return banded ? (
    <Button
      ref={anchorRef}
      label={name}
      spoken={spoken}
      icon="user"
      variant="text"
      onPress={open}
    />
  ) : (
    <FilterChip
      anchorRef={anchorRef}
      affordance="menu"
      expanded={expanded}
      label="Person"
      value={name}
      icon="user"
      active={false}
      onPress={open}
    />
  );
}

export function PersonChip({
  deviceId,
  people,
  person,
  compact = false,
}: {
  readonly deviceId: string;
  readonly people: readonly Person[];
  readonly person: Person | null;
  readonly compact?: boolean;
}): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  if (person === null || people.length < 2) {
    return null;
  }
  return (
    <>
      <Trigger
        anchorRef={ref}
        name={person.profile.name}
        open={() => {
          measureAnchor(ref, setAnchor);
        }}
        expanded={anchor !== null}
        compact={compact}
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
