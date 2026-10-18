import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useRevealed } from '../../../components/show-more';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from '../data/computer-metrics';
import { timerLine, usbLine } from './system-model';

export function TimersSection({ deviceId }: { readonly deviceId: string }): ReactNode {
  const timers = useComputerSelect(
    deviceId,
    (parts) => {
      const now = Date.now();
      return (parts.services?.timers ?? []).map((timer) => ({
        unit: timer.unit,
        title: timer.description === '' ? timer.unit : timer.description,
        line: timerLine(timer, now),
      }));
    },
    sameJson,
  );
  const { shown, more } = useRevealed(timers);
  if (timers.length === 0) return null;
  return (
    <>
      <List title="Scheduled" caption={String(timers.length)}>
        {shown.map((timer) => (
          <ListRow key={timer.unit} title={timer.title} subtitle={timer.line} icon="clock" />
        ))}
      </List>
      {more}
    </>
  );
}

export function UsbSection({ deviceId }: { readonly deviceId: string }): ReactNode {
  const devices = useComputerSelect(deviceId, (parts) => parts.system?.usb ?? [], sameJson);
  const { shown, more } = useRevealed(devices);
  if (devices.length === 0) return null;
  return (
    <>
      <List title="USB devices" caption={String(devices.length)}>
        {shown.map((device) => {
          const line = usbLine(device);
          return (
            <ListRow
              key={device.id}
              title={device.name}
              icon="plug"
              {...(line === '' ? {} : { subtitle: line })}
            />
          );
        })}
      </List>
      {more}
    </>
  );
}
