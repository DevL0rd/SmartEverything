import {
  humanizeKey,
  type DeviceEvent,
  type EventKind,
  type JsonValue,
} from '@smarteverything/domain';
import type { DataPoint } from './data-points';
import type { ReportedValue } from './model';

interface EventRule {
  readonly codes: readonly string[];
  readonly kind: EventKind;
  readonly match: (value: unknown) => JsonValue | null;
  readonly cause: string | null;
}

const ALERT_CODE =
  /(?:^|_)(?:alarm|alert|warn|warning|fault|tamper|temper|sos|siren|trigger|intrusion|overload|overheat)(?:_|$)/;

const QUIET_VALUES: ReadonlySet<JsonValue> = new Set([
  false,
  0,
  '',
  '0',
  'normal',
  'none',
  'off',
  'ok',
  'cancel',
  'clear',
]);

const BUTTON_CODE = /^(?:switch(\d+)_value|switch_mode(\d+))$/;

function equals(expected: string | boolean): (value: unknown) => JsonValue | null {
  return (value) => (value === expected ? expected : null);
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

const EVENT_RULES: readonly EventRule[] = [
  { codes: ['pir'], kind: 'motion', match: equals('pir'), cause: null },
  { codes: ['watersensor_state'], kind: 'leak', match: equals('alarm'), cause: null },
  { codes: ['smoke_sensor_status'], kind: 'smoke', match: equals('alarm'), cause: null },
  { codes: ['smoke_sensor_state'], kind: 'smoke', match: equals('1'), cause: null },
  { codes: ['gas_sensor_status'], kind: 'alarm', match: equals('alarm'), cause: 'gas' },
  { codes: ['gas_sensor_state'], kind: 'alarm', match: equals('1'), cause: 'gas' },
  { codes: ['co_status'], kind: 'alarm', match: equals('alarm'), cause: 'carbon_monoxide' },
  { codes: ['co_state'], kind: 'alarm', match: equals('1'), cause: 'carbon_monoxide' },
  { codes: ['sos_state'], kind: 'alarm', match: equals(true), cause: 'sos' },
  {
    codes: ['doorbell_active', 'doorbell_pic'],
    kind: 'doorbell',
    match: nonEmptyText,
    cause: null,
  },
];

function buttonEvent(
  externalId: string,
  reported: ReportedValue,
  occurredAt: string,
): DeviceEvent | null {
  const match = BUTTON_CODE.exec(reported.code);
  const action = nonEmptyText(reported.value);
  if (match === null || action === null) {
    return null;
  }
  return {
    externalId,
    kind: 'button',
    occurredAt,
    details: {
      code: reported.code,
      button: Number(match[1] ?? match[2]),
      action,
    },
  };
}

function isHandled(code: string): boolean {
  return BUTTON_CODE.test(code) || EVENT_RULES.some((rule) => rule.codes.includes(code));
}

function activeAlertValue(value: unknown): JsonValue | null {
  const scalar =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  return scalar && !QUIET_VALUES.has(value) ? value : null;
}

function alertEvent(
  externalId: string,
  reported: ReportedValue,
  occurredAt: string,
  points: readonly DataPoint[],
): DeviceEvent | null {
  const { code } = reported;
  const readOnly = points.some((point) => point.code === code && !point.writable);
  const value = activeAlertValue(reported.value);
  if (!readOnly || value === null || !ALERT_CODE.test(code) || isHandled(code)) {
    return null;
  }
  return {
    externalId,
    kind: 'activity',
    occurredAt,
    details: { code, value, summary: humanizeKey(code) },
  };
}

export function eventsOf(
  externalId: string,
  report: readonly ReportedValue[],
  occurredAt: string,
  points: readonly DataPoint[],
): readonly DeviceEvent[] {
  return report.flatMap((reported): DeviceEvent[] => {
    const alert = alertEvent(externalId, reported, occurredAt, points);
    if (alert !== null) {
      return [alert];
    }
    const button = buttonEvent(externalId, reported, occurredAt);
    const matched = EVENT_RULES.filter((rule) => rule.codes.includes(reported.code)).flatMap(
      (rule): DeviceEvent[] => {
        const value = rule.match(reported.value);
        if (value === null) {
          return [];
        }
        const cause = rule.cause === null ? {} : { cause: rule.cause };
        return [
          {
            externalId,
            kind: rule.kind,
            occurredAt,
            details: { code: reported.code, value, ...cause },
          },
        ];
      },
    );
    return button === null ? matched : [button, ...matched];
  });
}
