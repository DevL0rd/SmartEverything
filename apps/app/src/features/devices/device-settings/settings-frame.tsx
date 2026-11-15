import type { ReactNode } from 'react';
import type { AppHref } from '../../../components/app-href';
import { useTabGroup } from '../../../app-shell/tab-group';
import { href } from '../../../app-shell/hrefs';
import type { Crumb } from '../../../components/breadcrumbs';
import type { ShellWidth } from '../../../components/page-shell/layout';
import { PageShell } from '../../../components/page-shell/page-shell';
import { useDevice } from '../../../store/selectors';

const ORIGINS: Readonly<Record<string, Crumb>> = {
  '(settings)': { label: 'Devices', href: href.settings.page('devices') },
  '(home)': { label: 'Home', href: href.home() },
  '(cameras)': { label: 'Cameras', href: href.cameras() },
  '(fitness)': { label: 'Fitness', href: href.fitness() },
  '(automations)': { label: 'Automations', href: href.automations() },
};

const DEVICES: Crumb = { label: 'Devices', href: href.devices() };

function settingsHref(deviceId: string): AppHref {
  return href.settings.device(deviceId);
}

function useDeviceSettingsCrumbs(deviceId: string, name: string, sub: boolean): readonly Crumb[] {
  const group = useTabGroup() ?? '';
  const device = useDevice(deviceId);
  const origin = ORIGINS[group] ?? DEVICES;
  return [
    origin,
    device === null ? { label: name } : { label: name, href: href.device(device) },
    ...(sub ? [{ label: 'Settings', href: settingsHref(deviceId) }] : []),
  ];
}

export function DeviceSettingsFrame({
  deviceId,
  name,
  title,
  width = 'reading',
  children,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly title: string;
  readonly width?: ShellWidth;
  readonly children: ReactNode;
}): ReactNode {
  const sub = title !== name;
  const crumbs = useDeviceSettingsCrumbs(deviceId, name, sub);
  return (
    <PageShell
      title={sub ? title : `${name} settings`}
      {...(sub ? { subtitle: name } : {})}
      breadcrumbs={crumbs}
      width={width}
    >
      {children}
    </PageShell>
  );
}
