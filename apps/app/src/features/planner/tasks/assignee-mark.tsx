import type { PlannerItemRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRow } from '../../../store/selectors';
import { PersonBadge } from '../item/person-badge';
import type { AssignedSide } from './task-grouping';

export function assigneeMarkOf(
  item: Pick<PlannerItemRow, 'assignee_id' | 'profile_id'>,
  side: AssignedSide | null,
): { readonly profileId: string; readonly prefix: string } | null {
  if (item.assignee_id === null || item.assignee_id === item.profile_id) return null;
  if (side === 'to_me') return { profileId: item.profile_id, prefix: 'From' };
  return { profileId: item.assignee_id, prefix: 'Assigned to' };
}

export function AssigneeMark({
  item,
  side,
}: {
  readonly item: PlannerItemRow;
  readonly side: AssignedSide | null;
}): ReactNode {
  const mark = assigneeMarkOf(item, side);
  const profile = useRow('profiles', mark?.profileId ?? null);
  if (mark === null) return null;
  const name = profile?.name ?? 'Someone in the home';
  return (
    <View accessible accessibilityLabel={`${mark.prefix} ${name}`}>
      <PersonBadge profile={profile} name={name} size="xs" />
    </View>
  );
}
