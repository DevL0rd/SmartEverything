import { describe, expect, it } from 'vitest';
import { scheduleOf } from './diffuser-schedule';
import {
  DIFFUSER,
  OTHER_DEVICE,
  lit,
  program,
  row,
  setPower,
  step,
  trigger,
} from './consumer-fixtures';
import type { ConsumerRow } from './row';

function schedule(
  id: string,
  at: string,
  on: boolean,
  options: { enabled?: boolean; device?: string } = {},
): ConsumerRow {
  return row(
    id,
    id,
    program(
      [trigger(1, 'trigger.time', { at: lit(at) })],
      [setPower(1, options.device ?? DIFFUSER, on)],
    ),
    options.enabled ?? true,
  );
}

describe('schedule line from automations', () => {
  it('reads on and off times of enabled automations that set this diffuser power', () => {
    expect(
      scheduleOf([schedule('b', '00:00', false), schedule('a', '15:00', true)], DIFFUSER),
    ).toEqual({
      text: 'On 15:00 · off 00:00',
      automationId: 'a',
    });
  });

  it('ignores disabled automations and other devices', () => {
    const rows = [
      schedule('a', '15:00', true, { enabled: false }),
      schedule('b', '16:00', true, { device: OTHER_DEVICE }),
    ];
    expect(scheduleOf(rows, DIFFUSER)).toBeNull();
  });

  it('reads a device inside a devices list', () => {
    const listed = row(
      'l',
      'List',
      program(
        [trigger(1, 'trigger.time', { at: lit('07:00') })],
        [
          step(1, 'device.set', {
            target: lit({ devices: [OTHER_DEVICE, DIFFUSER] }),
            control: lit('power'),
            to: lit(true),
          }),
        ],
      ),
    );
    expect(scheduleOf([listed], DIFFUSER)?.text).toBe('On 07:00');
  });

  it('skips switched-off nodes, other controls and non-literal values', () => {
    const body = [
      { ...setPower(1, DIFFUSER, true), enabled: false },
      step(2, 'device.set', {
        target: lit({ device: DIFFUSER }),
        control: lit('brightness'),
        to: lit(true),
      }),
      step(3, 'device.set', {
        target: lit({ device: DIFFUSER }),
        control: lit('power'),
        to: { wire: { from: 'x', port: 'value' } },
      }),
      step(4, 'device.set', { control: lit('power'), to: lit(true) }),
    ];
    const rows = [row('z', 'Z', program([trigger(1, 'trigger.time', { at: lit('07:00') })], body))];
    expect(scheduleOf(rows, DIFFUSER)).toBeNull();
  });

  it('has no line without any scheduled power change', () => {
    expect(scheduleOf([], DIFFUSER)).toBeNull();
    const noTime = row(
      't',
      'T',
      program([trigger(1, 'trigger.sun', { event: lit('sunset') })], [setPower(1, DIFFUSER, true)]),
    );
    expect(scheduleOf([noTime], DIFFUSER)).toBeNull();
  });
});
