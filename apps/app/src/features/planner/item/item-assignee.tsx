import type { PlannerItemRow, ProfileRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { SelectRow, ValueRow } from '../../../components/rows';
import type { ItemChanges } from './repeat-scope-bar';

const NOBODY = 'nobody';

export function assigneeOptionsOf(
  profiles: readonly ProfileRow[],
  me: string | null,
): readonly { value: string; label: string }[] {
  return [
    { value: NOBODY, label: 'Nobody' },
    ...[...profiles]
      .sort((left, right) => left.position - right.position)
      .map((profile) => ({
        value: profile.id,
        label: profile.id === me ? `${profile.name} (you)` : profile.name,
      })),
  ];
}

export function assigneeChangeOf(value: string): Pick<ItemChanges, 'assignee_id'> {
  return { assignee_id: value === NOBODY ? null : value };
}

export interface AssigneeFieldProps {
  readonly item: PlannerItemRow;
  readonly profiles: readonly ProfileRow[];
  readonly me: string | null;
  readonly disabled: boolean;
  readonly onChange: (changes: ItemChanges) => void;
}

function nameIn(profiles: readonly ProfileRow[], id: string): string {
  return profiles.find((profile) => profile.id === id)?.name ?? 'Someone in the home';
}

export function AssigneeField({
  item,
  profiles,
  me,
  disabled,
  onChange,
}: AssigneeFieldProps): ReactNode {
  if (item.kind !== 'task') return null;
  if (item.profile_id !== me) {
    return (
      <ValueRow
        wrapTitle
        title="Assigned by"
        icon="users"
        value={nameIn(profiles, item.profile_id)}
      />
    );
  }
  return (
    <SelectRow
      wrapTitle
      title="Assigned to"
      icon="users"
      options={assigneeOptionsOf(profiles, me)}
      value={item.assignee_id ?? NOBODY}
      disabled={disabled}
      onChange={(value) => {
        onChange(assigneeChangeOf(value));
      }}
    />
  );
}
