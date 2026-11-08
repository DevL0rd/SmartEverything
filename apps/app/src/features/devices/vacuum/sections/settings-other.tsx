import { useState, type ReactNode } from 'react';
import type { DevicePresentation } from '@smarteverything/domain';
import { ListRow } from '../../../../components/list-row';
import { List } from '../../../../components/section';
import type { Device } from '../../../../store/state';
import { CapabilityRow } from '../../controls/capability-row';
import { withoutHomeOf } from '../page-homes';

export const OTHER_TITLE = 'Other';

export function VacuumOtherSettings({
  device,
  presentation,
  reason,
}: {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly reason: string | null;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const rows = withoutHomeOf(presentation);
  if (rows.length === 0) {
    return null;
  }
  return (
    <List
      title={OTHER_TITLE}
      footer="Raw entries from Xiaomi that have no place on this page yet, with their own names."
    >
      <ListRow
        title={open ? 'Hide other entries' : `Show ${String(rows.length)} other entries`}
        icon={open ? 'chevronUp' : 'chevronDown'}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open
        ? rows.map((presented) => (
            <CapabilityRow
              key={presented.key}
              device={device}
              presented={presented}
              reason={reason}
            />
          ))
        : []}
    </List>
  );
}
