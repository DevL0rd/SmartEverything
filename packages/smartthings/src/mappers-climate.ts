import {
  enumControl,
  levelControl,
  numberDescriptor,
  numberSensor,
  type NumberRange,
} from './mapper-factories';
import { PERCENT, rangeFrom } from './mappers-lighting';
import {
  attributeUnit,
  attributeValue,
  call,
  numberOf,
  readNumber,
  type CapabilityMapper,
  type StandardMapping,
} from './mapper-kit';

const CELSIUS_SETPOINTS: NumberRange = { min: 5, max: 40, step: 0.5 };

const FAHRENHEIT_SETPOINTS: NumberRange = { min: 40, max: 104, step: 1 };

const TEMPERATURE_READINGS: NumberRange = { min: -460, max: 10000, step: 0.1 };

const FAN_SPEEDS: NumberRange = { min: 0, max: 3, step: 1 };

function setpointMapper(capability: string, attribute: string, command: string): CapabilityMapper {
  const rangeAttribute = `${attribute}Range`;
  return {
    capability,
    attributes: [attribute, rangeAttribute],
    commands: [command],
    map: (view): readonly StandardMapping[] => {
      const unit = attributeUnit(view.status, capability, attribute);
      const fallback = unit === 'F' ? FAHRENHEIT_SETPOINTS : CELSIUS_SETPOINTS;
      const range = rangeFrom(attributeValue(view.status, capability, rangeAttribute), fallback);
      return [
        {
          key: 'target_temperature',
          access: 'read_write',
          value: numberDescriptor(view, { capability, attribute, range, unit: null }),
          sources: [{ capability, attribute }],
          read: readNumber(capability, attribute),
          write: (value) => [call(capability, command, [numberOf(capability, value)])],
        },
      ];
    },
  };
}

const THERMOSTAT_MODES = ['auto', 'cool', 'eco', 'rush hour', 'emergency heat', 'heat', 'off'];

const AIR_CONDITIONER_MODES = [
  'auto',
  'cool',
  'dry',
  'coolClean',
  'dryClean',
  'fanOnly',
  'heat',
  'heatClean',
];

function modeMappers(): readonly CapabilityMapper[] {
  return [
    setpointMapper('thermostatCoolingSetpoint', 'coolingSetpoint', 'setCoolingSetpoint'),
    setpointMapper('thermostatHeatingSetpoint', 'heatingSetpoint', 'setHeatingSetpoint'),
    enumControl({
      capability: 'airConditionerMode',
      attribute: 'airConditionerMode',
      key: 'hvac_mode',
      choices: { reportedBy: 'supportedAcModes', otherwise: AIR_CONDITIONER_MODES },
      command: 'setAirConditionerMode',
    }),
    enumControl({
      capability: 'thermostatMode',
      attribute: 'thermostatMode',
      key: 'hvac_mode',
      choices: { reportedBy: 'supportedThermostatModes', otherwise: THERMOSTAT_MODES },
      command: 'setThermostatMode',
    }),
    enumControl({
      capability: 'airConditionerFanMode',
      attribute: 'fanMode',
      key: 'fan_mode',
      choices: {
        reportedBy: 'supportedAcFanModes',
        otherwise: ['auto', 'low', 'medium', 'high', 'turbo'],
      },
      command: 'setFanMode',
    }),
    enumControl({
      capability: 'thermostatFanMode',
      attribute: 'thermostatFanMode',
      key: 'fan_mode',
      choices: {
        reportedBy: 'supportedThermostatFanModes',
        otherwise: ['auto', 'circulate', 'followschedule', 'on'],
      },
      command: 'setThermostatFanMode',
    }),
    enumControl({
      capability: 'fanOscillationMode',
      attribute: 'fanOscillationMode',
      key: 'swing',
      choices: {
        reportedBy: 'supportedFanOscillationModes',
        otherwise: ['fixed', 'vertical', 'horizontal', 'all'],
      },
      command: 'setFanOscillationMode',
    }),
  ];
}

function fanAndReadingMappers(): readonly CapabilityMapper[] {
  return [
    levelControl({
      capability: 'fanSpeed',
      attribute: 'fanSpeed',
      key: 'fan_speed',
      command: 'setFanSpeed',
      range: FAN_SPEEDS,
      unit: null,
    }),
    enumControl({
      capability: 'airPurifierFanMode',
      attribute: 'airPurifierFanMode',
      key: 'purifier_mode',
      choices: {
        reportedBy: 'supportedAirPurifierFanModes',
        otherwise: ['auto', 'sleep', 'low', 'medium', 'high'],
      },
      command: 'setAirPurifierFanMode',
    }),
    numberSensor({
      capability: 'temperatureMeasurement',
      attribute: 'temperature',
      key: 'temperature',
      range: TEMPERATURE_READINGS,
      unit: null,
    }),
    numberSensor({
      capability: 'relativeHumidityMeasurement',
      attribute: 'humidity',
      key: 'humidity',
      range: PERCENT,
      unit: '%',
    }),
  ];
}

export function climateMappers(): readonly CapabilityMapper[] {
  return [...modeMappers(), ...fanAndReadingMappers()];
}
