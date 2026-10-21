import type { ReactNode } from 'react';
import { SwitchRow } from '../../../components/rows';

export function ReadOnlyRow({
  who,
  value,
  onChange,
}: {
  readonly who: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}): ReactNode {
  return (
    <SwitchRow
      title="Read only"
      subtitle={`${who} can read the home but change nothing`}
      icon="lock"
      value={value}
      onChange={onChange}
    />
  );
}
