import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePrimaryPrinter } from '../data/printer-device';

interface Props {
  readonly title: string;
  readonly icon: IconName;
  readonly children: (device: Device) => ReactNode;
}

function NoPrinter({ title, icon }: Pick<Props, 'title' | 'icon'>): ReactNode {
  const owner = useIsOwner();
  return (
    <WidgetFrame title={title} icon={icon} accent="primary">
      <WidgetEmpty
        icon="printer"
        colour="primary"
        title="No printer yet"
        body={owner ? 'Add a network printer to see it here.' : 'Ask the owner to add the printer.'}
        {...(owner ? { action: { label: 'Add printer', href: href.connect('printer') } } : {})}
      />
    </WidgetFrame>
  );
}

export function PrinterWidgetShell({ title, icon, children }: Props): ReactNode {
  const device = usePrimaryPrinter();
  return device === null ? (
    <NoPrinter title={title} icon={icon} />
  ) : (
    <WidgetFrame title={title} icon={icon} accent="primary" href={href.device(device)}>
      {children(device)}
    </WidgetFrame>
  );
}
