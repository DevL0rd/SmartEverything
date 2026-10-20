import type { ReactNode } from 'react';
import { withRole, type PresentedCapability } from '@smarteverything/domain';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import { isWideClass, type WideClass } from '../card/wide-card';
import { deviceModelOf, powerStateOf, type PowerState } from '../model/device-model';
import { CardActions } from './card-actions';
import { HumidifierGraph } from './humidifier-parts';
import { humidityStateText } from './humidity-model';
import { levelPercent, numberAt } from './reading';
import { SensorFrame, useVisibleFrame } from './sensor-frame';
import { levelPill } from './state-line';

interface Roles {
  readonly humidity: PresentedCapability;
  readonly target: PresentedCapability | undefined;
  readonly water: PresentedCapability | undefined;
}

interface HumidifierRead {
  readonly power: PowerState;
  readonly humidity: number | null;
  readonly target: number | null;
  readonly water: number | null;
}

function useHumidifierRead(device: Device, roles: Roles): HumidifierRead {
  const model = deviceModelOf(device);
  const { humidity, target, water } = roles;
  return useDeviceDerived(
    device.id,
    (values) => ({
      power: powerStateOf(model, values),
      humidity: numberAt(values, humidity.key),
      target: numberAt(values, target?.key),
      water:
        water === undefined ? null : levelPercent(water.capability, numberAt(values, water.key)),
    }),
    [model, humidity, target, water],
  );
}

function factsOf(line: string, read: HumidifierRead): readonly string[] {
  return [
    line,
    ...(read.water === null ? [] : [`Water ${String(Math.round(read.water))} percent`]),
  ];
}

function WideHumidifier({
  device,
  cls,
  roles,
}: {
  readonly device: Device;
  readonly cls: WideClass;
  readonly roles: Roles;
}): ReactNode {
  const visible = useVisibleFrame();
  const read = useHumidifierRead(device, roles);
  const pill = levelPill('Water', read.water);
  const line = humidityStateText(read.humidity, read.target, read.power);
  return (
    <SensorFrame
      device={device}
      cls={cls}
      visible={visible}
      line={line}
      tone={read.power === 'on' ? 'primary' : 'variant'}
      offline={read.power === 'offline'}
      facts={factsOf(line, read)}
      figures={cls === 'm' || pill === null ? [] : [pill]}
      graph={
        <HumidifierGraph
          device={device}
          capability={roles.humidity.key}
          humidity={read.humidity}
          target={read.target}
          water={read.water}
          cls={cls}
          live={visible.live}
        />
      }
      actions={[<CardActions key="actions" device={device} cls={cls} />]}
    />
  );
}

export function HumidifierCard(props: CardFaceProps): ReactNode {
  const presentation = deviceModelOf(props.device).presentation;
  const humidity = withRole(presentation, 'humidity');
  const { device, cls } = props;
  return isWideClass(cls) && humidity !== undefined ? (
    <WideHumidifier
      device={device}
      cls={cls}
      roles={{
        humidity,
        target: withRole(presentation, 'target_humidity'),
        water: withRole(presentation, 'water_level'),
      }}
    />
  ) : (
    <GenericCardFace {...props} />
  );
}
