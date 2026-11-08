import type { ReactNode } from 'react';
import { ChoiceChip } from '../../../components/choice-chip';
import type { SelectOption } from '../../../components/select-picker';
import { compareText } from '../../../format/text';

export interface PersonOption {
  readonly id: string;
  readonly name: string;
}

export const EVERYONE_VALUE = 'everyone';
export const YOU_VALUE = 'you';

export function personOptionsOf(
  people: readonly PersonOption[],
  me: string | null,
): readonly SelectOption<string>[] {
  const others = people
    .filter((person) => person.id !== me)
    .sort((first, second) => compareText(first.name, second.name));
  return [
    { value: EVERYONE_VALUE, label: 'Everyone' },
    ...(me === null ? [] : [{ value: YOU_VALUE, label: 'You' }]),
    ...others.map((person) => ({ value: person.id, label: person.name })),
  ];
}

export interface PersonPickerProps {
  readonly people: readonly PersonOption[];
  readonly me: string | null;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function PersonPicker({ people, me, value, onChange }: PersonPickerProps): ReactNode {
  return (
    <ChoiceChip
      label="Person"
      icon={value === EVERYONE_VALUE ? 'users' : 'user'}
      options={personOptionsOf(people, me)}
      value={value}
      all={EVERYONE_VALUE}
      onChange={onChange}
    />
  );
}
