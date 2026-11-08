import type { ReactNode } from 'react';
import type { PresentedCapability } from '@smarteverything/domain';
import { CopyButton } from '../../../../components/copy-button';
import { ListRow } from '../../../../components/list-row';
import { href } from '../../../../app-shell/hrefs';
import { NavRow, ValueRow } from '../../../../components/rows';
import { useDeviceDerived } from '../../../../store/selectors';
import type { Device } from '../../../../store/state';
import { useDeviceControl } from '../../controls/use-device-control';
import { shownValue, useDeviceModel } from '../../model/device-model';
import { aboutFactsOf, type AboutFact } from '../model/about-facts';

function FactRow({ fact }: { readonly fact: AboutFact }): ReactNode {
  if (!fact.copyable) {
    return <ValueRow title={fact.title} value={fact.text} />;
  }
  return (
    <ListRow
      title={fact.title}
      subtitle={fact.text}
      wrapSubtitle
      trailing={<CopyButton value={fact.text} label={`Copy ${fact.title.toLowerCase()}`} />}
    />
  );
}

export function useSystemRows(device: Device): ReactNode {
  const { presentation } = useDeviceModel(device);
  const facts = useDeviceDerived(
    device.id,
    (values) =>
      aboutFactsOf({
        presentation,
        read: (key) => values[key]?.value,
        deviceModel: device.model,
      }),
    [presentation, device.model],
  );
  return (
    <>
      {facts.map((fact) => (
        <FactRow key={fact.id} fact={fact} />
      ))}
      <NavRow
        key="diagnostics"
        title="All diagnostics"
        icon="info"
        href={href.settings.device(device.id, 'diagnostics')}
      />
    </>
  );
}

export function ReadingRow({
  device,
  presented,
  note,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly note: string;
}): ReactNode {
  const control = useDeviceControl(device, presented);
  return (
    <ListRow
      title={presented.label}
      subtitle={note}
      wrapSubtitle
      value={shownValue(presented, control.value)}
    />
  );
}
