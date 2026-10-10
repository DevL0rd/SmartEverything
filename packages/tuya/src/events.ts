import type { DeviceEvent, EventKind, JsonValue } from '@smarteverything/domain';
import type { ReportedValue } from './model';

interface EventRule {
  readonly codes: readonly string[];
  readonly kind: EventKind;
  readonly match: (value: unknown) => JsonValue | null;
  readonly cause: string | null;
}

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

export function eventsOf(
  externalId: string,
  report: readonly ReportedValue[],
  occurredAt: string,
): readonly DeviceEvent[] {
  return report.flatMap((reported): DeviceEvent[] => {
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
