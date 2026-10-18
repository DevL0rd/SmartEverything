import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ClockText, PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { TimeField, localeUsesHour12, type TimeOfDay } from '../../../components/time-field';
import type { Control } from '../../../store/control';
import { clockLabel, clockTextOf, parseClockText } from '../model/clock-text';
import { background } from '@smarteverything/logging';

const MIDNIGHT: TimeOfDay = { hour: 0, minute: 0 };

function TimeSheet({
  presented,
  initial,
  clock,
  control,
  onClose,
}: {
  readonly presented: PresentedCapability;
  readonly initial: TimeOfDay;
  readonly clock: ClockText;
  readonly control: Control;
  readonly onClose: () => void;
}): ReactNode {
  const [time, setTime] = useState(initial);
  return (
    <Sheet
      open
      onClose={onClose}
      title={presented.label}
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button
            label="Save"
            onPress={() => {
              onClose();
              background(control.set(clockTextOf(time, clock)), 'control.set_failed');
            }}
          />
        </>
      }
    >
      <TimeField
        label={presented.label}
        value={time}
        onChange={setTime}
        hour12={localeUsesHour12()}
      />
    </Sheet>
  );
}

export function TimeRow({
  presented,
  clock,
  control,
  disabled,
}: {
  readonly presented: PresentedCapability;
  readonly clock: ClockText;
  readonly control: Control;
  readonly disabled: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const text = typeof control.value === 'string' ? control.value : null;
  const time = text === null ? null : parseClockText(text);
  const unreadable = text !== null && time === null;
  return (
    <>
      <ListRow
        title={presented.label}
        value={time === null ? 'Not set' : clockLabel(time)}
        {...(unreadable ? { subtitle: `Unreadable time “${text}”`, subtitleTone: 'warning' } : {})}
        chevron
        disabled={disabled}
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <TimeSheet
          presented={presented}
          initial={time ?? MIDNIGHT}
          clock={clock}
          control={control}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
