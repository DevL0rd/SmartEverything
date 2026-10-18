import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Tone } from '../../../components/tone';
import { useComputerDetail } from '../data/computer-metrics';
import {
  ACTION_STATE_TEXT,
  actionRows,
  permissionRows,
  type ActionRow,
} from '../model/machine-view';

const STATE_TONE: Readonly<Record<ActionRow['state'], Tone>> = {
  ready: 'positive',
  needs_permission: 'warning',
  unsupported: 'variant',
};

function ActionList({
  rows,
  machine,
}: {
  readonly rows: readonly ActionRow[];
  readonly machine: string;
}): ReactNode {
  return (
    <List title="Remote actions" footer={`What SmartEverything can do on ${machine} when asked.`}>
      {rows.map((row) => (
        <ListRow
          key={row.action}
          title={row.title}
          icon={row.icon}
          iconTone={STATE_TONE[row.state]}
          {...(row.detail === null ? {} : { subtitle: row.detail, wrapSubtitle: true })}
          value={ACTION_STATE_TEXT[row.state]}
        />
      ))}
    </List>
  );
}

export function MachineSection({
  deviceId,
  machine,
  online,
}: {
  readonly deviceId: string;
  readonly machine: string;
  readonly online: boolean;
}): ReactNode {
  const detail = useComputerDetail(deviceId, online);
  if (detail.data === undefined) return null;
  const actions = actionRows(detail.data.machineActions);
  const permissions = permissionRows(detail.data.permissions, machine);
  return (
    <>
      {actions.length === 0 ? null : <ActionList rows={actions} machine={machine} />}
      {permissions.length === 0 ? null : (
        <List title="Permissions">
          {permissions.map((row) => (
            <ListRow
              key={row.id}
              title={row.label}
              icon={row.granted ? 'circleCheck' : 'warning'}
              iconTone={row.granted ? 'positive' : 'warning'}
              {...(row.granted ? {} : { subtitle: row.how, wrapSubtitle: true })}
              value={row.granted ? 'Granted' : 'Needed'}
            />
          ))}
        </List>
      )}
    </>
  );
}
