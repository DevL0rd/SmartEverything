import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { MemberOutcome } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { ROW_GAP, type RowGroup } from '../model/member-rows';
import { MemberCell } from './member-rows';

const ROW_STYLE = { columnGap: ROW_GAP, paddingBottom: ROW_GAP } as const;

export function VirtualMemberRow({
  group,
  columns,
  expanded,
  outcomes,
  onToggle,
}: {
  readonly group: RowGroup<Device>;
  readonly columns: number;
  readonly expanded: string | null;
  readonly outcomes: ReadonlyMap<string, MemberOutcome>;
  readonly onToggle: (deviceId: string) => void;
}): ReactNode {
  return (
    <View className="flex-row items-start" style={ROW_STYLE}>
      {group.members.map((member) => (
        <View key={member.id} className="min-w-0 flex-1">
          <MemberCell
            member={member}
            expanded={expanded === member.id}
            outcome={outcomes.get(member.id) ?? null}
            onToggle={onToggle}
          />
        </View>
      ))}
      {Array.from({ length: columns - group.members.length }, (_, spare) => (
        <View key={`spare-${String(spare)}`} className="min-w-0 flex-1" />
      ))}
    </View>
  );
}
