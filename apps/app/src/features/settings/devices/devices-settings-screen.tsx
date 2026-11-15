import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';
import { useIsOwner } from '../../../store/selectors';

const ADD_DEVICE: ShellAction = {
  icon: 'plus',
  label: 'Add a device',
  href: href.settings.page('devices/add'),
  primary: true,
};

export function DevicesSettingsScreen(): ReactNode {
  const owner = useIsOwner();
  return (
    <SettingsFrame page="devices" {...(owner ? { actions: [ADD_DEVICE] } : {})}>
      <SettingsPageBody page="devices" />
    </SettingsFrame>
  );
}
