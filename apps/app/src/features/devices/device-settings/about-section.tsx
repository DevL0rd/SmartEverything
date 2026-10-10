import type { ReactNode } from 'react';
import { PROVIDER_INFO, withRole } from '@smarteverything/domain';
import { NavRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { href } from '../../../app-shell/hrefs';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { connectionOf } from '../model/connection';
import { useDeviceModel, valueOf } from '../model/device-model';

export function AboutSection({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const connection = connectionOf(device);
  const firmware = valueOf(values, withRole(model.presentation, 'firmware'));
  return (
    <List title="About">
      <ValueRow title="Account" icon="link" value={PROVIDER_INFO[device.provider].name} />
      <ValueRow title="Model" icon="cpu" value={device.model} />
      {connection === null ? null : <ValueRow title="Connection" icon="wifi" value={connection} />}
      {typeof firmware === 'string' ? (
        <ValueRow title="Firmware" icon="layers" value={firmware} />
      ) : null}
      <NavRow
        title="Diagnostics"
        icon="wrench"
        href={href.settings.device(device.id, 'diagnostics')}
      />
    </List>
  );
}
