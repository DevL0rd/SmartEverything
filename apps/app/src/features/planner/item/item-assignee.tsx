import type { PlannerItemRow, ProfileRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { SelectRow, ValueRow } from '../../../components/rows';
import type { SelectOption } from '../../../components/select-picker';
import { PersonBadge } from './person-badge';
import type { ItemChanges } from './repeat-scope-bar';

const NOBODY = 'nobody';

const MENU_WIDTH = 280;

function NobodyBadge(): ReactNode {
  return (
    <View className="size-5 items-center justify-center rounded-full bg-surface-3">
      <Icon name="user" size={12} tone="variant" />
    </View>
  );
}

export function assigneeOptionsOf(
  profiles: readonly ProfileRow[],
  me: string | null,
): readonly SelectOption<string>[] {
  return [
    { value: NOBODY, label: 'Nobody', leading: <NobodyBadge /> },
    ...[...profiles]
      .sort((left, right) => left.position - right.position)
      .map((profile) => ({
        value: profile.id,
        label: profile.id === me ? `${profile.name} (you)` : profile.name,
        leading: <PersonBadge profile={profile} name={profile.name} size="xs" />,
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
      menuWidth={MENU_WIDTH}
      disabled={disabled}
      onChange={(value) => {
        onChange(assigneeChangeOf(value));
      }}
    />
  );
}
