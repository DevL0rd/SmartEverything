import type { ReactNode } from 'react';
import { useSegments, type Href } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { Crumb } from '../../../components/breadcrumbs';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useDevice } from '../../../store/selectors';

const ORIGINS: Readonly<Record<string, Crumb>> = {
  '(home)': { label: 'Home', href: href.home() },
  '(cameras)': { label: 'Cameras', href: href.cameras() },
  '(fitness)': { label: 'Fitness', href: href.fitness() },
  '(automations)': { label: 'Automations', href: href.automations() },
};

const DEVICES: Crumb = { label: 'Devices', href: href.devices() };

function settingsHref(deviceId: string): Href {
  return href.settings.device(deviceId);
}

export function useDeviceSettingsCrumbs(
  deviceId: string,
  name: string,
  sub: boolean,
): readonly Crumb[] {
  const group = useSegments()[1] ?? '';
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
  children,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  const sub = title !== name;
  const crumbs = useDeviceSettingsCrumbs(deviceId, name, sub);
  return (
    <Screen
      header={
        <PageHeader
          title={sub ? title : `${name} settings`}
          {...(sub ? { subtitle: name } : {})}
          breadcrumbs={crumbs}
        />
      }
      maxWidth="reading"
    >
      {children}
    </Screen>
  );
}
