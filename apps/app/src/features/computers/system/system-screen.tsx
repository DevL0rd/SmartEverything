import type { ReactNode } from 'react';
import { Skeleton } from '../../../components/skeleton';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerFrame } from '../components/computer-frame';
import { DemandRegion } from '../../../store/demand-region';
import { StateMissing } from '../components/state-missing';
import { useComputerSelect } from '../data/computer-metrics';
import { useStateSeed } from '../data/computer-state';
import { BatteryCard } from './battery-card';
import { TimersSection, UsbSection } from './info-sections';
import { MachineSection } from './machine-section';
import { PowerSection } from './power-section';
import { ServicesSection } from './services-section';
import { SettingsSection } from './settings-section';
import { StartupSection } from './startup-section';

const TOPICS = ['system', 'services'] as const;

function Live({ device }: { readonly device: Device }): ReactNode {
  const loaded = useComputerSelect(device.id, (parts) => parts.system !== undefined);
  const load = useStateSeed(device.id, 'system', device.online);
  const offline = !device.online;
  if (!loaded) {
    return (
      <StateMissing
        load={load}
        offline={offline}
        loading={<Skeleton shape="block" className="h-40" />}
      />
    );
  }
  return (
    <>
      <BatteryCard deviceId={device.id} />
      <SettingsSection deviceId={device.id} offline={offline} />
      <StartupSection deviceId={device.id} offline={offline} />
      <ServicesSection device={device} />
      <MachineSection deviceId={device.id} machine={device.label} online={device.online} />
      <TimersSection deviceId={device.id} />
      <UsbSection deviceId={device.id} />
    </>
  );
}

function System({ device }: { readonly device: Device }): ReactNode {
  return (
    <ComputerFrame deviceId={device.id} title="Power and system" subtitle={device.label}>
      <PowerSection device={device} />
      <DemandRegion deviceId={device.id} topics={TOPICS} className="gap-section-gap">
        <Live device={device} />
      </DemandRegion>
    </ComputerFrame>
  );
}

export function ComputerSystemScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  if (device?.kind !== 'computer') {
    return (
      <ComputerFrame deviceId={deviceId} title="Power and system">
        {null}
      </ComputerFrame>
    );
  }
  return <System device={device} />;
}
