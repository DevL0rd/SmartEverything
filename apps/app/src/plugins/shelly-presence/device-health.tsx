import type { ReactNode } from 'react';
import type { ShellyPresenceDevice, ShellySystemComponent } from '@smarteverything/domain';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
function amount(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${String(value)} bytes`;
}
export function DeviceHealth({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const component = sensor.components.find((entry) => entry.component === 'sys');
  return component?.component === 'sys' ? <HealthRows component={component} /> : null;
}
function HealthRows({
  component,
}: {
  readonly component: Extract<ShellySystemComponent, { readonly component: 'sys' }>;
}): ReactNode {
  const status = component.status;
  if (status === null) return <ValueRow title="Device health" value="Unknown" />;
  return (
    <List title="Device health">
      <ValueRow title="RAM size" value={amount(status.ram_size)} />
      <ValueRow title="RAM free" value={amount(status.ram_free)} />
      <ValueRow title="Filesystem size" value={amount(status.fs_size)} />
      <ValueRow title="Filesystem free" value={amount(status.fs_free)} />
      <ValueRow
        title="Uptime"
        value={status.uptime === undefined ? 'Unknown' : `${String(status.uptime)} seconds`}
      />
      <ValueRow
        title="Restart required"
        value={
          status.restart_required === undefined ? 'Unknown' : status.restart_required ? 'Yes' : 'No'
        }
      />
      <ValueRow
        title="Last clock sync"
        value={
          status.last_sync_ts === undefined || status.last_sync_ts === null
            ? 'Unknown'
            : new Date(status.last_sync_ts * 1000).toLocaleString()
        }
      />
      <AvailableFirmware updates={status.available_updates} />
    </List>
  );
}

function AvailableFirmware({
  updates,
}: {
  readonly updates: NonNullable<
    Extract<ShellySystemComponent, { readonly component: 'sys' }>['status']
  >['available_updates'];
}): ReactNode {
  return (
    <>
      {
        <ValueRow
          title="Available stable firmware"
          value={updates?.stable?.version ?? 'None reported'}
        />
      }
      {
        <ValueRow
          title="Available beta firmware"
          value={updates?.beta?.version ?? 'None reported'}
        />
      }
    </>
  );
}
