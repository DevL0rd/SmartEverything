import type { ReactNode } from 'react';
import type { IconName } from '../../components/icon';
import { WideCard, type WideClass } from '../../features/devices';
import type { Device } from '../../store/state';
import { CellLine } from './cell-parts';
import { ServiceMedallion } from './service-medallion';

export function PendingCell({
  device,
  cls,
  glyph,
  subject,
  line,
  action,
}: {
  readonly device: Device;
  readonly cls: WideClass;
  readonly glyph: IconName;
  readonly subject: string;
  readonly line: string;
  readonly action: ReactNode;
}): ReactNode {
  return (
    <WideCard
      cls={cls}
      summary={`${subject}, ${line}`}
      title={device.label}
      visual={
        <ServiceMedallion
          glyph={glyph}
          tone="neutral"
          ratio={null}
          live={false}
          size={cls === 'm' ? 'cell' : 'hero'}
          label={line}
          offline
        />
      }
      state={<CellLine text={line} />}
      actions={action === null ? [] : [action]}
    />
  );
}
