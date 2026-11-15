import { useState, type ReactNode } from 'react';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { PhoneApps, PhoneAppsSearch } from '../apps/phone-apps';
import { usePhoneView } from '../components/use-phone-view';
import { usePhoneSection } from '../data/phone-detail';
import { PhonePage } from '../frame/phone-page';
import { pageAccessOf } from '../model/page-access';

function useAppsSearch(device: Device): ShellSearchConfig | undefined {
  const [query, setQuery] = useState('');
  const full = pageAccessOf(usePhoneView(device).tier) === 'full';
  const section = usePhoneSection(device.id, 'apps');
  if (!full || section === undefined || section.installed.length === 0) return undefined;
  return {
    value: query,
    onChange: setQuery,
    placeholder: 'Search apps',
    label: 'Search apps',
    panel: <PhoneAppsSearch section={section} device={device} query={query} />,
  };
}

function Apps({ device }: { readonly device: Device }): ReactNode {
  const search = useAppsSearch(device);
  return (
    <PhonePage
      deviceId={device.id}
      title="Apps"
      width="dashboard"
      {...(search === undefined ? {} : { search })}
    >
      {(phone) => <PhoneApps device={phone} />}
    </PhonePage>
  );
}

export function PhoneAppsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  if (device?.kind !== 'phone') {
    return (
      <PhonePage deviceId={deviceId} title="Apps" width="dashboard">
        {(phone) => <PhoneApps device={phone} />}
      </PhonePage>
    );
  }
  return <Apps device={device} />;
}
