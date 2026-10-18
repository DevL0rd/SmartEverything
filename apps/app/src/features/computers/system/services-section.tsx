import { useState, type ReactNode } from 'react';
import { isHubOwnUnit, type ServiceRow } from '@smarteverything/domain';
import { Disclosure } from '../../../components/disclosure';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useRevealed } from '../../../components/show-more';
import { Text } from '../../../components/text';
import { sameJson } from '../../../store/same-json';
import type { Device } from '../../../store/state';
import { StateMissing } from '../components/state-missing';
import { useComputerSelect } from '../data/computer-metrics';
import { isHub } from '../data/computer-device';
import { useStateSeed } from '../data/computer-state';
import { useServiceChange } from '../data/computer-system';
import { ServiceItem } from './service-item';
import { serviceGroups, serviceState, serviceSubtitle, serviceTitle } from './system-model';

function YourServices({
  device,
  services,
}: {
  readonly device: Device;
  readonly services: readonly ServiceRow[];
}): ReactNode {
  const change = useServiceChange(device.id, device.label);
  const { shown, more } = useRevealed(services);
  const hub = isHub(device);
  const busy = change.isPending ? change.variables.unit : null;
  return (
    <>
      <List title="Your services" caption={String(services.length)}>
        {shown.map((service) => (
          <ServiceItem
            key={service.unit}
            service={service}
            hubOwn={hub ? isHubOwnUnit(service.unit) : false}
            disabled={!device.online || busy === service.unit}
            onChange={change.mutate}
          />
        ))}
      </List>
      {more}
    </>
  );
}

function SystemServices({ services }: { readonly services: readonly ServiceRow[] }): ReactNode {
  const [open, setOpen] = useState(false);
  const { shown, more } = useRevealed(services);
  return (
    <Disclosure
      label={open ? 'Hide system services' : `Show ${String(services.length)} system services`}
      open={open}
      hint="Shows services that run for the whole computer. You can only look at them here."
      onToggle={() => {
        setOpen(!open);
      }}
      trailing={
        <Text variant="caption" tone="variant">
          Read only
        </Text>
      }
    >
      <List>
        {shown.map((service) => {
          const state = serviceState(service.state);
          const subtitle = serviceSubtitle(service);
          return (
            <ListRow
              key={service.unit}
              title={serviceTitle(service)}
              {...(subtitle === null ? {} : { subtitle })}
              value={state.word}
            />
          );
        })}
      </List>
      {more}
    </Disclosure>
  );
}

export function ServicesSection({ device }: { readonly device: Device }): ReactNode {
  const groups = useComputerSelect(
    device.id,
    (parts) => (parts.services === undefined ? null : serviceGroups(parts.services.services)),
    sameJson,
  );
  const load = useStateSeed(device.id, 'services', device.online);
  if (groups === null) return <StateMissing load={load} offline={!device.online} loading={null} />;
  return (
    <>
      {groups.yours.length === 0 ? null : <YourServices device={device} services={groups.yours} />}
      {groups.system.length === 0 ? null : <SystemServices services={groups.system} />}
    </>
  );
}
