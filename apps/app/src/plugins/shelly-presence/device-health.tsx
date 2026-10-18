import type { ReactNode } from 'react';
import type { ShellyDevice } from '@smarteverything/shelly';
import { z } from 'zod';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { dateTimeText } from '../../format/locale';

const VERSION = z.looseObject({ version: z.string().optional() }).optional();
const SYS_STATUS = z.looseObject({
  ram_size: z.number().optional(),
  ram_free: z.number().optional(),
  fs_size: z.number().optional(),
  fs_free: z.number().optional(),
  uptime: z.number().optional(),
  restart_required: z.boolean().optional(),
  last_sync_ts: z.number().nullable().optional(),
  available_updates: z.looseObject({ stable: VERSION, beta: VERSION }).optional(),
});
type SysStatus = z.output<typeof SYS_STATUS>;

function amount(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${String(value)} bytes`;
}

function clockSync(status: SysStatus): string {
  return status.last_sync_ts === undefined || status.last_sync_ts === null
    ? 'Unknown'
    : dateTimeText(new Date(status.last_sync_ts * 1000));
}

function restart(status: SysStatus): string {
  return status.restart_required === undefined ? 'Unknown' : status.restart_required ? 'Yes' : 'No';
}

export function DeviceHealth({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const raw = sensor.components.find((entry) => entry.component === 'sys')?.status;
  const parsed = SYS_STATUS.safeParse(raw);
  if (!parsed.success) return <ValueRow title="Device health" value="Unknown" />;
  const status = parsed.data;
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
      <ValueRow title="Restart required" value={restart(status)} />
      <ValueRow title="Last clock sync" value={clockSync(status)} />
      <ValueRow
        title="Available stable firmware"
        value={status.available_updates?.stable?.version ?? 'None reported'}
      />
      <ValueRow
        title="Available beta firmware"
        value={status.available_updates?.beta?.version ?? 'None reported'}
      />
    </List>
  );
}
