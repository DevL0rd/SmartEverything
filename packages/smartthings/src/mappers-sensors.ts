import type { JsonValue, StandardCapability } from '@smarteverything/domain';
import { booleanSensor, numberSensor, type NumberRange } from './mapper-factories';
import { PERCENT } from './mappers-lighting';
import {
  attributeValue,
  finiteNumber,
  isJsonRecord,
  readString,
  type CapabilityMapper,
} from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';

const READINGS: NumberRange = { min: 0, max: 100_000, step: 0.1 };

const SIGNAL_READINGS: NumberRange = { min: -200, max: 0, step: 1 };

const WATT_HOURS_PER_KILOWATT_HOUR = 1000;

function reading(
  capability: string,
  attribute: string,
  key: StandardCapability,
  unit: string | null,
): CapabilityMapper {
  return numberSensor({ capability, attribute, key, range: READINGS, unit });
}

function dustMapper(
  capability: string,
  entries: readonly (readonly [string, StandardCapability])[],
): CapabilityMapper {
  return {
    capability,
    attributes: entries.map(([attribute]) => attribute),
    commands: [],
    map: (view) =>
      entries.flatMap(([attribute, key]) =>
        reading(capability, attribute, key, 'μg/m^3').map(view),
      ),
  };
}

function consumption(status: ComponentStatus, field: string): number | undefined {
  const report = attributeValue(status, 'powerConsumptionReport', 'powerConsumption');
  if (!isJsonRecord(report)) {
    return undefined;
  }
  return finiteNumber(report[field]);
}

function kilowattHours(status: ComponentStatus): JsonValue | undefined {
  const energy = consumption(status, 'energy');
  return energy === undefined ? undefined : energy / WATT_HOURS_PER_KILOWATT_HOUR;
}

const powerConsumptionMapper: CapabilityMapper = {
  capability: 'powerConsumptionReport',
  attributes: ['powerConsumption'],
  commands: [],
  map: () => {
    const sources = [{ capability: 'powerConsumptionReport', attribute: 'powerConsumption' }];
    return [
      {
        key: 'power_draw',
        access: 'read',
        value: { kind: 'number', ...READINGS, unit: 'W' },
        sources,
        read: (status) => consumption(status, 'power'),
        write: null,
      },
      {
        key: 'energy',
        access: 'read',
        value: { kind: 'number', ...READINGS, unit: 'kWh' },
        sources,
        read: kilowattHours,
        write: null,
      },
    ];
  },
};

const firmwareMapper: CapabilityMapper = {
  capability: 'firmwareUpdate',
  attributes: ['currentVersion'],
  commands: [],
  map: () => [
    {
      key: 'firmware',
      access: 'read',
      value: { kind: 'text', maxLength: 256 },
      sources: [{ capability: 'firmwareUpdate', attribute: 'currentVersion' }],
      read: readString('firmwareUpdate', 'currentVersion'),
      write: null,
    },
  ],
};

export function sensorMappers(): readonly CapabilityMapper[] {
  return [
    booleanSensor('motionSensor', 'motion', 'motion', ['active']),
    booleanSensor('contactSensor', 'contact', 'contact', ['open']),
    booleanSensor('waterSensor', 'water', 'leak', ['wet']),
    booleanSensor('smokeDetector', 'smoke', 'smoke', ['detected', 'tested']),
    booleanSensor('occupancySensor', 'occupancy', 'occupancy', ['occupied']),
    booleanSensor('presenceSensor', 'presence', 'occupancy', ['present']),
    booleanSensor('accelerationSensor', 'acceleration', 'vibration', ['active']),
    numberSensor({
      capability: 'battery',
      attribute: 'battery',
      key: 'battery',
      range: PERCENT,
      unit: '%',
    }),
    reading('illuminanceMeasurement', 'illuminance', 'illuminance', 'lux'),
    reading('carbonDioxideMeasurement', 'carbonDioxide', 'co2', 'ppm'),
    reading('tvocMeasurement', 'tvocLevel', 'tvoc', null),
    reading('formaldehydeMeasurement', 'formaldehydeLevel', 'hcho', null),
    reading('airQualitySensor', 'airQuality', 'air_quality_index', 'CAQI'),
    dustMapper('dustSensor', [
      ['dustLevel', 'pm10'],
      ['fineDustLevel', 'pm25'],
    ]),
    dustMapper('fineDustSensor', [['fineDustLevel', 'pm25']]),
    reading('atmosphericPressureMeasurement', 'atmosphericPressure', 'pressure', null),
    reading('filterState', 'filterLifeRemaining', 'filter_life', '%'),
    reading('powerMeter', 'power', 'power_draw', 'W'),
    reading('energyMeter', 'energy', 'energy', 'kWh'),
    reading('voltageMeasurement', 'voltage', 'voltage', 'V'),
    powerConsumptionMapper,
    numberSensor({
      capability: 'signalStrength',
      attribute: 'rssi',
      key: 'signal_strength',
      range: SIGNAL_READINGS,
      unit: 'dBm',
    }),
    firmwareMapper,
  ];
}
