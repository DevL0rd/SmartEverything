import { describe, expect, it } from 'vitest';
import { eventsOf } from '../src';
import type { DataPoint } from '../src/data-points';

const AT = '2026-10-08T10:00:00.000Z';

function point(code: string, writable: boolean): DataPoint {
  return {
    code,
    dpId: null,
    name: null,
    readable: true,
    writable,
    shape: { type: 'Raw', maxLength: 255 },
  };
}

const POINTS: readonly DataPoint[] = [
  point('temper_alarm', false),
  point('fault', false),
  point('alarm_switch', true),
  point('siren_state', false),
  point('temp_current', false),
  point('pir', false),
  point('sos_state', false),
  point('watersensor_state', false),
];

function kinds(code: string, value: unknown): unknown {
  return eventsOf('d1', [{ code, value }], AT, POINTS).map((event) => [event.kind, event.details]);
}

describe('events from reported data points', () => {
  it('raises sensor events only on their alarm value', () => {
    expect(kinds('pir', 'pir')).toStrictEqual([['motion', { code: 'pir', value: 'pir' }]]);
    expect(kinds('pir', 'none')).toStrictEqual([]);
    expect(kinds('watersensor_state', 'alarm')).toStrictEqual([
      ['leak', { code: 'watersensor_state', value: 'alarm' }],
    ]);
    expect(kinds('watersensor_state', 'normal')).toStrictEqual([]);
    expect(kinds('smoke_sensor_status', 'alarm')).toStrictEqual([
      ['smoke', { code: 'smoke_sensor_status', value: 'alarm' }],
    ]);
    expect(kinds('smoke_sensor_state', '1')).toStrictEqual([
      ['smoke', { code: 'smoke_sensor_state', value: '1' }],
    ]);
    expect(kinds('smoke_sensor_state', '2')).toStrictEqual([]);
  });

  it('raises alarms with their cause', () => {
    expect(kinds('gas_sensor_status', 'alarm')).toStrictEqual([
      ['alarm', { code: 'gas_sensor_status', value: 'alarm', cause: 'gas' }],
    ]);
    expect(kinds('gas_sensor_state', '1')).toStrictEqual([
      ['alarm', { code: 'gas_sensor_state', value: '1', cause: 'gas' }],
    ]);
    expect(kinds('co_status', 'alarm')).toStrictEqual([
      ['alarm', { code: 'co_status', value: 'alarm', cause: 'carbon_monoxide' }],
    ]);
    expect(kinds('co_state', '1')).toStrictEqual([
      ['alarm', { code: 'co_state', value: '1', cause: 'carbon_monoxide' }],
    ]);
    expect(kinds('sos_state', true)).toStrictEqual([
      ['alarm', { code: 'sos_state', value: true, cause: 'sos' }],
    ]);
    expect(kinds('sos_state', false)).toStrictEqual([]);
  });

  it('raises a doorbell press for any doorbell report with content', () => {
    expect(kinds('doorbell_active', 'url')).toStrictEqual([
      ['doorbell', { code: 'doorbell_active', value: 'url' }],
    ]);
    expect(kinds('doorbell_pic', 'aGk=')).toStrictEqual([
      ['doorbell', { code: 'doorbell_pic', value: 'aGk=' }],
    ]);
    expect(kinds('doorbell_pic', '')).toStrictEqual([]);
    expect(kinds('doorbell_active', 1)).toStrictEqual([]);
  });

  it('raises button presses with the button number and action', () => {
    expect(kinds('switch1_value', 'single_click')).toStrictEqual([
      ['button', { code: 'switch1_value', button: 1, action: 'single_click' }],
    ]);
    expect(kinds('switch_mode3', 'long_press')).toStrictEqual([
      ['button', { code: 'switch_mode3', button: 3, action: 'long_press' }],
    ]);
    expect(kinds('switch_mode12', 'click')).toStrictEqual([
      ['button', { code: 'switch_mode12', button: 12, action: 'click' }],
    ]);
    expect(kinds('switch12_value', 'click')).toStrictEqual([
      ['button', { code: 'switch12_value', button: 12, action: 'click' }],
    ]);
    expect(kinds('switch1_value', '')).toStrictEqual([]);
    expect(kinds('xswitch1_value', 'click')).toStrictEqual([]);
    expect(kinds('switch1_valuex', 'click')).toStrictEqual([]);
  });

  it('stamps each event with the device and the time', () => {
    expect(
      eventsOf(
        'd1',
        [
          { code: 'pir', value: 'pir' },
          { code: 'switch_1', value: true },
        ],
        AT,
        POINTS,
      ),
    ).toStrictEqual([
      { externalId: 'd1', kind: 'motion', occurredAt: AT, details: { code: 'pir', value: 'pir' } },
    ]);
  });

  it('keeps a structured value as JSON text', () => {
    expect(kinds('doorbell_pic', 'x')).toHaveLength(1);
    expect(
      eventsOf('d1', [{ code: 'sos_state', value: true }], AT, POINTS)[0]?.details['value'],
    ).toBe(true);
    expect(eventsOf('d1', [{ code: 'pir', value: 'pir' }], AT, POINTS)[0]?.details['value']).toBe(
      'pir',
    );
  });

  it('passes a read-only alert data point through as an activity event named by its code', () => {
    expect(kinds('temper_alarm', 'alarm')).toStrictEqual([
      ['activity', { code: 'temper_alarm', value: 'alarm', summary: 'Temper alarm' }],
    ]);
    expect(kinds('fault', 4)).toStrictEqual([
      ['activity', { code: 'fault', value: 4, summary: 'Fault' }],
    ]);
    expect(kinds('siren_state', true)).toStrictEqual([
      ['activity', { code: 'siren_state', value: true, summary: 'Siren state' }],
    ]);
  });

  it('stays quiet for cleared alerts, settings, readings and codes with their own event', () => {
    expect(kinds('temper_alarm', 'normal')).toStrictEqual([]);
    expect(kinds('fault', 0)).toStrictEqual([]);
    expect(kinds('siren_state', false)).toStrictEqual([]);
    expect(kinds('alarm_switch', true)).toStrictEqual([]);
    expect(kinds('temp_current', 21)).toStrictEqual([]);
    expect(kinds('sos_state', false)).toStrictEqual([]);
    expect(kinds('unknown_alarm', 'alarm')).toStrictEqual([]);
    expect(kinds('fault', { nested: 1 })).toStrictEqual([]);
    expect(kinds('watersensor_state', 'alarm')).toHaveLength(1);
  });
});
