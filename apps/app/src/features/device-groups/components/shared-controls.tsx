import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DeviceTarget } from '@smarteverything/domain';
import { Section } from '../../../components/section';
import type { Device } from '../../../store/state';
import { groupControlChoices } from '../group-choices';
import { GroupControl } from '../group-control';

const MASTER_ROLES: ReadonlySet<string> = new Set([
  'power',
  'brightness',
  'color_temperature',
  'color',
]);

export function SharedControls({
  target,
  members,
}: {
  readonly target: DeviceTarget;
  readonly members: readonly Device[];
}): ReactNode {
  const choices = groupControlChoices(members).filter(
    (choice) => !MASTER_ROLES.has(choice.presented.role ?? ''),
  );
  if (choices.length === 0) return null;
  return (
    <Section title="Shared controls">
      <View className="gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-3">
        {choices.map((choice) => (
          <GroupControl key={choice.reference} target={target} members={members} choice={choice} />
        ))}
      </View>
    </Section>
  );
}
