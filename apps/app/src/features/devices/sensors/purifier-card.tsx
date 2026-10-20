import type { ReactNode } from 'react';
import {
  AIR_BAND_LABELS,
  airBand,
  withRole,
  type PresentedCapability,
} from '@smarteverything/domain';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import { isWideClass, type WideClass } from '../card/wide-card';
import { deviceModelOf, powerStateOf, type PowerState } from '../model/device-model';
import { airStateText, airStateTone } from './air-model';
import { CardActions } from './card-actions';
import { PurifierGraph } from './purifier-parts';
import { levelPercent, numberAt } from './reading';
import { SensorFrame, useVisibleFrame } from './sensor-frame';
import { levelPill } from './state-line';

interface PurifierRead {
  readonly power: PowerState;
  readonly pm25: number | null;
  readonly filter: number | null;
}

function usePurifierRead(
  device: Device,
  pm: PresentedCapability,
  filter: PresentedCapability | undefined,
): PurifierRead {
  const model = deviceModelOf(device);
  return useDeviceDerived(
    device.id,
    (values) => ({
      power: powerStateOf(model, values),
      pm25: numberAt(values, pm.key),
      filter:
        filter === undefined ? null : levelPercent(filter.capability, numberAt(values, filter.key)),
    }),
    [model, pm, filter],
  );
}

function factsOf(line: string, read: PurifierRead): readonly string[] {
  return [
    line,
    ...(read.pm25 === null ? [] : [`PM2.5 ${String(Math.round(read.pm25))}`]),
    ...(read.filter === null ? [] : [`Filter ${String(Math.round(read.filter))} percent`]),
  ];
}

function WidePurifier({
  device,
  cls,
  pm,
  filter,
}: {
  readonly device: Device;
  readonly cls: WideClass;
  readonly pm: PresentedCapability;
  readonly filter: PresentedCapability | undefined;
}): ReactNode {
  const visible = useVisibleFrame();
  const read = usePurifierRead(device, pm, filter);
  const label = read.pm25 === null ? '' : AIR_BAND_LABELS[airBand(read.pm25)];
  const pill = levelPill('Filter', read.filter);
  const line = airStateText(read.pm25, label, read.power);
  return (
    <SensorFrame
      device={device}
      cls={cls}
      visible={visible}
      line={line}
      tone={airStateTone(read.pm25, read.power)}
      offline={read.power === 'offline'}
      facts={factsOf(line, read)}
      figures={cls === 'm' || pill === null ? [] : [pill]}
      graph={
        <PurifierGraph
          device={device}
          pm={pm}
          pm25={read.pm25}
          filter={read.filter}
          cls={cls}
          live={visible.live}
        />
      }
      actions={[<CardActions key="actions" device={device} cls={cls} />]}
    />
  );
}

export function PurifierCard(props: CardFaceProps): ReactNode {
  const presentation = deviceModelOf(props.device).presentation;
  const pm = withRole(presentation, 'pm25');
  const { device, cls } = props;
  return isWideClass(cls) && pm !== undefined ? (
    <WidePurifier
      device={device}
      cls={cls}
      pm={pm}
      filter={withRole(presentation, 'filter_life')}
    />
  ) : (
    <GenericCardFace {...props} />
  );
}
