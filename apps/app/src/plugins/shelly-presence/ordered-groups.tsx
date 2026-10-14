import type { ReactNode } from 'react';
import type { JsonValue, ShellyPresenceDevice } from '@smarteverything/domain';
import { MemberInput } from './member-input';
import { atPath } from './form-model';
export function OrderedGroups({
  sensor,
  value,
  change,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  const groups = sensor.components.filter((entry) => entry.component === 'group');
  const labels = Object.fromEntries(
    groups.map((entry) => {
      const name = atPath(entry.config, 'name');
      return [entry.key, typeof name === 'string' ? name : entry.key];
    }),
  );
  return (
    <MemberInput
      title="Group order"
      labels={labels}
      value={value ?? []}
      keys={groups.map((entry) => entry.key)}
      change={change}
    />
  );
}
