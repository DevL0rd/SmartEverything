import { MICROWAVE_KEYS, withRole } from '@smarteverything/domain';
import { useDeviceDerived } from '../../../store/selectors';
import { useMinuteOf } from '../../../store/clock';
import type { Device, DeviceValues } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';
import { microwaveConfiguration } from './model';
import {
  finishedAgo,
  finishedMoment,
  microwaveRun,
  minutesUntil,
  readyMoment,
  type MicrowaveRun,
} from './run-model';

interface Moments {
  readonly finished: number | null;
  readonly ready: number | null;
}

interface Tick {
  readonly ago: number | null;
  readonly minutes: number | null;
}

function momentsOf(values: DeviceValues): Moments {
  return { finished: finishedMoment(values), ready: readyMoment(values) };
}

function sameTick(left: Tick, right: Tick): boolean {
  return left.ago === right.ago && left.minutes === right.minutes;
}

export function useRun(device: Device): MicrowaveRun {
  const drawKey = withRole(deviceModelOf(device).presentation, 'power_draw')?.key ?? null;
  const moments = useDeviceDerived(device.id, momentsOf, []);
  const { ago, minutes } = useMinuteOf(
    (now): Tick => ({
      ago: finishedAgo(moments.finished, now),
      minutes: minutesUntil(moments.ready, now),
    }),
    sameTick,
  );
  return useDeviceDerived(
    device.id,
    (values) => {
      const applied = values[MICROWAVE_KEYS.mode]?.value;
      const spec = microwaveConfiguration(device, values).modes.find(
        (mode) => mode.mode === applied,
      );
      return microwaveRun({
        online: device.online,
        values,
        spec,
        ago,
        minutesLeft: minutes,
        drawKey,
      });
    },
    [device, ago, minutes, drawKey],
  );
}
