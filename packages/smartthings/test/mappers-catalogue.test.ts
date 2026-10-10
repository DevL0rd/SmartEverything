import { CAPABILITY_CATALOGUE, VALUE_DESCRIPTOR } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { allMappers } from '../src/mappers';
import { described, viewOf } from './helpers';

const REPRESENTATIVE = viewOf(
  {
    switchLevel: { level: 40 },
    colorTemperature: { colorTemperature: { value: 3000, unit: 'K' } },
    thermostatCoolingSetpoint: { coolingSetpoint: { value: 22, unit: 'C' } },
    thermostatHeatingSetpoint: { heatingSetpoint: { value: 68, unit: 'F' } },
    temperatureMeasurement: { temperature: { value: 21.5, unit: 'C' } },
    samsungvd: {},
    'samsungvd.mediaInputSource': {
      supportedInputSourcesMap: [
        { id: 'dtv', name: 'TV' },
        { id: 'HDMI1', name: 'Streaming stick' },
      ],
    },
  },
  ['colorControl'],
);

describe('the capability mappers', () => {
  it('cover these SmartThings capabilities, attributes and commands, in this order of preference', () => {
    expect(
      allMappers().map((mapper) => ({
        capability: mapper.capability,
        attributes: mapper.attributes,
        commands: mapper.commands,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "attributes": [
            "switch",
          ],
          "capability": "switch",
          "commands": [
            "on",
            "off",
          ],
        },
        {
          "attributes": [
            "level",
          ],
          "capability": "switchLevel",
          "commands": [
            "setLevel",
          ],
        },
        {
          "attributes": [
            "hue",
            "saturation",
            "color",
          ],
          "capability": "colorControl",
          "commands": [
            "setColor",
            "setHue",
            "setSaturation",
          ],
        },
        {
          "attributes": [
            "colorTemperature",
            "colorTemperatureRange",
          ],
          "capability": "colorTemperature",
          "commands": [
            "setColorTemperature",
          ],
        },
        {
          "attributes": [
            "coolingSetpoint",
            "coolingSetpointRange",
          ],
          "capability": "thermostatCoolingSetpoint",
          "commands": [
            "setCoolingSetpoint",
          ],
        },
        {
          "attributes": [
            "heatingSetpoint",
            "heatingSetpointRange",
          ],
          "capability": "thermostatHeatingSetpoint",
          "commands": [
            "setHeatingSetpoint",
          ],
        },
        {
          "attributes": [
            "airConditionerMode",
            "supportedAcModes",
          ],
          "capability": "airConditionerMode",
          "commands": [
            "setAirConditionerMode",
          ],
        },
        {
          "attributes": [
            "thermostatMode",
            "supportedThermostatModes",
          ],
          "capability": "thermostatMode",
          "commands": [
            "setThermostatMode",
          ],
        },
        {
          "attributes": [
            "fanMode",
            "supportedAcFanModes",
          ],
          "capability": "airConditionerFanMode",
          "commands": [
            "setFanMode",
          ],
        },
        {
          "attributes": [
            "thermostatFanMode",
            "supportedThermostatFanModes",
          ],
          "capability": "thermostatFanMode",
          "commands": [
            "setThermostatFanMode",
          ],
        },
        {
          "attributes": [
            "fanOscillationMode",
            "supportedFanOscillationModes",
          ],
          "capability": "fanOscillationMode",
          "commands": [
            "setFanOscillationMode",
          ],
        },
        {
          "attributes": [
            "fanSpeed",
          ],
          "capability": "fanSpeed",
          "commands": [
            "setFanSpeed",
          ],
        },
        {
          "attributes": [
            "airPurifierFanMode",
            "supportedAirPurifierFanModes",
          ],
          "capability": "airPurifierFanMode",
          "commands": [
            "setAirPurifierFanMode",
          ],
        },
        {
          "attributes": [
            "temperature",
          ],
          "capability": "temperatureMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "humidity",
          ],
          "capability": "relativeHumidityMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "volume",
          ],
          "capability": "audioVolume",
          "commands": [
            "setVolume",
          ],
        },
        {
          "attributes": [
            "mute",
          ],
          "capability": "audioMute",
          "commands": [
            "mute",
            "unmute",
            "setMute",
          ],
        },
        {
          "attributes": [
            "playbackStatus",
            "supportedPlaybackCommands",
          ],
          "capability": "mediaPlayback",
          "commands": [
            "play",
            "pause",
            "stop",
            "fastForward",
            "rewind",
            "setPlaybackStatus",
          ],
        },
        {
          "attributes": [
            "inputSource",
            "supportedInputSourcesMap",
          ],
          "capability": "samsungvd.mediaInputSource",
          "commands": [
            "setInputSource",
          ],
        },
        {
          "attributes": [
            "inputSource",
            "supportedInputSources",
          ],
          "capability": "mediaInputSource",
          "commands": [
            "setInputSource",
          ],
        },
        {
          "attributes": [
            "tvChannel",
          ],
          "capability": "tvChannel",
          "commands": [
            "setTvChannel",
          ],
        },
        {
          "attributes": [],
          "capability": "custom.launchapp",
          "commands": [
            "launchApp",
          ],
        },
        {
          "attributes": [
            "lock",
          ],
          "capability": "lock",
          "commands": [
            "lock",
            "unlock",
          ],
        },
        {
          "attributes": [
            "windowShade",
            "supportedWindowShadeCommands",
          ],
          "capability": "windowShade",
          "commands": [
            "open",
            "close",
            "pause",
          ],
        },
        {
          "attributes": [
            "shadeLevel",
          ],
          "capability": "windowShadeLevel",
          "commands": [
            "setShadeLevel",
          ],
        },
        {
          "attributes": [
            "robotCleanerMovement",
          ],
          "capability": "robotCleanerMovement",
          "commands": [
            "setRobotCleanerMovement",
          ],
        },
        {
          "attributes": [
            "robotCleanerTurboMode",
          ],
          "capability": "robotCleanerTurboMode",
          "commands": [
            "setRobotCleanerTurboMode",
          ],
        },
        {
          "attributes": [
            "button",
            "supportedButtonValues",
          ],
          "capability": "button",
          "commands": [],
        },
        {
          "attributes": [
            "alarm",
          ],
          "capability": "alarm",
          "commands": [
            "both",
            "off",
            "siren",
            "strobe",
          ],
        },
        {
          "attributes": [
            "motion",
          ],
          "capability": "motionSensor",
          "commands": [],
        },
        {
          "attributes": [
            "contact",
          ],
          "capability": "contactSensor",
          "commands": [],
        },
        {
          "attributes": [
            "water",
          ],
          "capability": "waterSensor",
          "commands": [],
        },
        {
          "attributes": [
            "smoke",
          ],
          "capability": "smokeDetector",
          "commands": [],
        },
        {
          "attributes": [
            "occupancy",
          ],
          "capability": "occupancySensor",
          "commands": [],
        },
        {
          "attributes": [
            "presence",
          ],
          "capability": "presenceSensor",
          "commands": [],
        },
        {
          "attributes": [
            "acceleration",
          ],
          "capability": "accelerationSensor",
          "commands": [],
        },
        {
          "attributes": [
            "battery",
          ],
          "capability": "battery",
          "commands": [],
        },
        {
          "attributes": [
            "illuminance",
          ],
          "capability": "illuminanceMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "carbonDioxide",
          ],
          "capability": "carbonDioxideMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "tvocLevel",
          ],
          "capability": "tvocMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "formaldehydeLevel",
          ],
          "capability": "formaldehydeMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "airQuality",
          ],
          "capability": "airQualitySensor",
          "commands": [],
        },
        {
          "attributes": [
            "dustLevel",
            "fineDustLevel",
          ],
          "capability": "dustSensor",
          "commands": [],
        },
        {
          "attributes": [
            "fineDustLevel",
          ],
          "capability": "fineDustSensor",
          "commands": [],
        },
        {
          "attributes": [
            "atmosphericPressure",
          ],
          "capability": "atmosphericPressureMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "filterLifeRemaining",
          ],
          "capability": "filterState",
          "commands": [],
        },
        {
          "attributes": [
            "power",
          ],
          "capability": "powerMeter",
          "commands": [],
        },
        {
          "attributes": [
            "energy",
          ],
          "capability": "energyMeter",
          "commands": [],
        },
        {
          "attributes": [
            "voltage",
          ],
          "capability": "voltageMeasurement",
          "commands": [],
        },
        {
          "attributes": [
            "powerConsumption",
          ],
          "capability": "powerConsumptionReport",
          "commands": [],
        },
        {
          "attributes": [
            "rssi",
          ],
          "capability": "signalStrength",
          "commands": [],
        },
        {
          "attributes": [
            "currentVersion",
          ],
          "capability": "firmwareUpdate",
          "commands": [],
        },
      ]
    `);
  });

  it('describe each standard capability like this for a representative device', () => {
    expect(
      Object.fromEntries(
        allMappers().map((mapper) => [
          mapper.capability,
          mapper.map(REPRESENTATIVE).map(described),
        ]),
      ),
    ).toMatchInlineSnapshot(`
      {
        "accelerationSensor": [
          {
            "access": "read",
            "key": "vibration",
            "sources": [
              {
                "attribute": "acceleration",
                "capability": "accelerationSensor",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": false,
          },
        ],
        "airConditionerFanMode": [
          {
            "access": "read_write",
            "key": "fan_mode",
            "sources": [
              {
                "attribute": "fanMode",
                "capability": "airConditionerFanMode",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "auto",
                "low",
                "medium",
                "high",
                "turbo",
              ],
            },
            "writable": true,
          },
        ],
        "airConditionerMode": [
          {
            "access": "read_write",
            "key": "hvac_mode",
            "sources": [
              {
                "attribute": "airConditionerMode",
                "capability": "airConditionerMode",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "auto",
                "cool",
                "dry",
                "coolClean",
                "dryClean",
                "fanOnly",
                "heat",
                "heatClean",
              ],
            },
            "writable": true,
          },
        ],
        "airPurifierFanMode": [
          {
            "access": "read_write",
            "key": "purifier_mode",
            "sources": [
              {
                "attribute": "airPurifierFanMode",
                "capability": "airPurifierFanMode",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "auto",
                "sleep",
                "low",
                "medium",
                "high",
              ],
            },
            "writable": true,
          },
        ],
        "airQualitySensor": [
          {
            "access": "read",
            "key": "air_quality_index",
            "sources": [
              {
                "attribute": "airQuality",
                "capability": "airQualitySensor",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "CAQI",
            },
            "writable": false,
          },
        ],
        "alarm": [
          {
            "access": "read_write",
            "key": "siren",
            "sources": [
              {
                "attribute": "alarm",
                "capability": "alarm",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": true,
          },
        ],
        "atmosphericPressureMeasurement": [
          {
            "access": "read",
            "key": "pressure",
            "sources": [
              {
                "attribute": "atmosphericPressure",
                "capability": "atmosphericPressureMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
            },
            "writable": false,
          },
        ],
        "audioMute": [
          {
            "access": "read_write",
            "key": "mute",
            "sources": [
              {
                "attribute": "mute",
                "capability": "audioMute",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": true,
          },
        ],
        "audioVolume": [
          {
            "access": "read_write",
            "key": "volume",
            "sources": [
              {
                "attribute": "volume",
                "capability": "audioVolume",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100,
              "min": 0,
              "step": 1,
              "unit": "%",
            },
            "writable": true,
          },
        ],
        "battery": [
          {
            "access": "read",
            "key": "battery",
            "sources": [
              {
                "attribute": "battery",
                "capability": "battery",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100,
              "min": 0,
              "step": 1,
              "unit": "%",
            },
            "writable": false,
          },
        ],
        "button": [
          {
            "access": "read",
            "key": "button",
            "sources": [
              {
                "attribute": "button",
                "capability": "button",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "pushed",
                "held",
                "double",
              ],
            },
            "writable": false,
          },
        ],
        "carbonDioxideMeasurement": [
          {
            "access": "read",
            "key": "co2",
            "sources": [
              {
                "attribute": "carbonDioxide",
                "capability": "carbonDioxideMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "ppm",
            },
            "writable": false,
          },
        ],
        "colorControl": [
          {
            "access": "read_write",
            "key": "color",
            "sources": [
              {
                "attribute": "hue",
                "capability": "colorControl",
              },
              {
                "attribute": "saturation",
                "capability": "colorControl",
              },
              {
                "attribute": "level",
                "capability": "switchLevel",
              },
            ],
            "value": {
              "kind": "color",
            },
            "writable": true,
          },
        ],
        "colorTemperature": [
          {
            "access": "read_write",
            "key": "color_temperature",
            "sources": [
              {
                "attribute": "colorTemperature",
                "capability": "colorTemperature",
              },
            ],
            "value": {
              "kind": "number",
              "max": 30000,
              "min": 1,
              "step": 1,
              "unit": "K",
            },
            "writable": true,
          },
        ],
        "contactSensor": [
          {
            "access": "read",
            "key": "contact",
            "sources": [
              {
                "attribute": "contact",
                "capability": "contactSensor",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": false,
          },
        ],
        "custom.launchapp": [
          {
            "access": "write",
            "key": "app_launch",
            "sources": [],
            "value": {
              "kind": "enum",
              "options": [
                "Netflix",
                "YouTube",
                "YouTube TV",
                "Prime Video",
                "Disney+",
                "Apple TV",
                "Apple Music",
                "Plex",
                "Spotify",
                "Max",
                "Hulu",
                "Paramount+",
                "Peacock",
                "Twitch",
                "Tubi",
                "Pluto TV",
                "Crunchyroll",
                "DAZN",
                "Xbox",
                "GeForce NOW",
                "SmartThings",
                "Gallery",
                "Browser",
              ],
            },
            "writable": true,
          },
        ],
        "dustSensor": [
          {
            "access": "read",
            "key": "pm10",
            "sources": [
              {
                "attribute": "dustLevel",
                "capability": "dustSensor",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "μg/m^3",
            },
            "writable": false,
          },
          {
            "access": "read",
            "key": "pm25",
            "sources": [
              {
                "attribute": "fineDustLevel",
                "capability": "dustSensor",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "μg/m^3",
            },
            "writable": false,
          },
        ],
        "energyMeter": [
          {
            "access": "read",
            "key": "energy",
            "sources": [
              {
                "attribute": "energy",
                "capability": "energyMeter",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "kWh",
            },
            "writable": false,
          },
        ],
        "fanOscillationMode": [
          {
            "access": "read_write",
            "key": "swing",
            "sources": [
              {
                "attribute": "fanOscillationMode",
                "capability": "fanOscillationMode",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "fixed",
                "vertical",
                "horizontal",
                "all",
              ],
            },
            "writable": true,
          },
        ],
        "fanSpeed": [
          {
            "access": "read_write",
            "key": "fan_speed",
            "sources": [
              {
                "attribute": "fanSpeed",
                "capability": "fanSpeed",
              },
            ],
            "value": {
              "kind": "number",
              "max": 3,
              "min": 0,
              "step": 1,
            },
            "writable": true,
          },
        ],
        "filterState": [
          {
            "access": "read",
            "key": "filter_life",
            "sources": [
              {
                "attribute": "filterLifeRemaining",
                "capability": "filterState",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "%",
            },
            "writable": false,
          },
        ],
        "fineDustSensor": [
          {
            "access": "read",
            "key": "pm25",
            "sources": [
              {
                "attribute": "fineDustLevel",
                "capability": "fineDustSensor",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "μg/m^3",
            },
            "writable": false,
          },
        ],
        "firmwareUpdate": [
          {
            "access": "read",
            "key": "firmware",
            "sources": [
              {
                "attribute": "currentVersion",
                "capability": "firmwareUpdate",
              },
            ],
            "value": {
              "kind": "text",
              "maxLength": 256,
            },
            "writable": false,
          },
        ],
        "formaldehydeMeasurement": [
          {
            "access": "read",
            "key": "hcho",
            "sources": [
              {
                "attribute": "formaldehydeLevel",
                "capability": "formaldehydeMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
            },
            "writable": false,
          },
        ],
        "illuminanceMeasurement": [
          {
            "access": "read",
            "key": "illuminance",
            "sources": [
              {
                "attribute": "illuminance",
                "capability": "illuminanceMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "lux",
            },
            "writable": false,
          },
        ],
        "lock": [
          {
            "access": "read_write",
            "key": "lock",
            "sources": [
              {
                "attribute": "lock",
                "capability": "lock",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": true,
          },
        ],
        "mediaInputSource": [
          {
            "access": "read_write",
            "key": "input_source",
            "sources": [
              {
                "attribute": "inputSource",
                "capability": "mediaInputSource",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "AM",
                "CD",
                "FM",
                "HDMI",
                "HDMI1",
                "HDMI2",
                "HDMI3",
                "HDMI4",
                "HDMI5",
                "HDMI6",
                "digitalTv",
                "USB",
                "YouTube",
                "aux",
                "bluetooth",
                "digital",
                "melon",
                "wifi",
              ],
            },
            "writable": true,
          },
        ],
        "mediaPlayback": [
          {
            "access": "read_write",
            "key": "playback",
            "sources": [
              {
                "attribute": "playbackStatus",
                "capability": "mediaPlayback",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "playing",
                "paused",
                "stopped",
                "fast forwarding",
                "rewinding",
              ],
            },
            "writable": true,
          },
        ],
        "motionSensor": [
          {
            "access": "read",
            "key": "motion",
            "sources": [
              {
                "attribute": "motion",
                "capability": "motionSensor",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": false,
          },
        ],
        "occupancySensor": [
          {
            "access": "read",
            "key": "occupancy",
            "sources": [
              {
                "attribute": "occupancy",
                "capability": "occupancySensor",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": false,
          },
        ],
        "powerConsumptionReport": [
          {
            "access": "read",
            "key": "power_draw",
            "sources": [
              {
                "attribute": "powerConsumption",
                "capability": "powerConsumptionReport",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "W",
            },
            "writable": false,
          },
          {
            "access": "read",
            "key": "energy",
            "sources": [
              {
                "attribute": "powerConsumption",
                "capability": "powerConsumptionReport",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "kWh",
            },
            "writable": false,
          },
        ],
        "powerMeter": [
          {
            "access": "read",
            "key": "power_draw",
            "sources": [
              {
                "attribute": "power",
                "capability": "powerMeter",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "W",
            },
            "writable": false,
          },
        ],
        "presenceSensor": [
          {
            "access": "read",
            "key": "occupancy",
            "sources": [
              {
                "attribute": "presence",
                "capability": "presenceSensor",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": false,
          },
        ],
        "relativeHumidityMeasurement": [
          {
            "access": "read",
            "key": "humidity",
            "sources": [
              {
                "attribute": "humidity",
                "capability": "relativeHumidityMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100,
              "min": 0,
              "step": 1,
              "unit": "%",
            },
            "writable": false,
          },
        ],
        "robotCleanerMovement": [
          {
            "access": "read_write",
            "key": "cleaning",
            "sources": [
              {
                "attribute": "robotCleanerMovement",
                "capability": "robotCleanerMovement",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "cleaning",
                "homing",
                "pause",
                "idle",
                "charging",
                "alarm",
                "powerOff",
                "reserve",
                "point",
                "after",
              ],
            },
            "writable": true,
          },
        ],
        "robotCleanerTurboMode": [
          {
            "access": "read_write",
            "key": "suction",
            "sources": [
              {
                "attribute": "robotCleanerTurboMode",
                "capability": "robotCleanerTurboMode",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "on",
                "off",
                "silence",
                "extraSilence",
              ],
            },
            "writable": true,
          },
        ],
        "samsungvd.mediaInputSource": [
          {
            "access": "read_write",
            "key": "input_source",
            "sources": [
              {
                "attribute": "inputSource",
                "capability": "samsungvd.mediaInputSource",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "dtv",
                "HDMI1",
              ],
            },
            "writable": true,
          },
        ],
        "signalStrength": [
          {
            "access": "read",
            "key": "signal_strength",
            "sources": [
              {
                "attribute": "rssi",
                "capability": "signalStrength",
              },
            ],
            "value": {
              "kind": "number",
              "max": 0,
              "min": -200,
              "step": 1,
              "unit": "dBm",
            },
            "writable": false,
          },
        ],
        "smokeDetector": [
          {
            "access": "read",
            "key": "smoke",
            "sources": [
              {
                "attribute": "smoke",
                "capability": "smokeDetector",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": false,
          },
        ],
        "switch": [
          {
            "access": "read_write",
            "key": "power",
            "sources": [
              {
                "attribute": "switch",
                "capability": "switch",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": true,
          },
        ],
        "switchLevel": [
          {
            "access": "read_write",
            "key": "brightness",
            "sources": [
              {
                "attribute": "level",
                "capability": "switchLevel",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100,
              "min": 0,
              "step": 1,
              "unit": "%",
            },
            "writable": true,
          },
        ],
        "temperatureMeasurement": [
          {
            "access": "read",
            "key": "temperature",
            "sources": [
              {
                "attribute": "temperature",
                "capability": "temperatureMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 10000,
              "min": -460,
              "step": 0.1,
              "unit": "C",
            },
            "writable": false,
          },
        ],
        "thermostatCoolingSetpoint": [
          {
            "access": "read_write",
            "key": "target_temperature",
            "sources": [
              {
                "attribute": "coolingSetpoint",
                "capability": "thermostatCoolingSetpoint",
              },
            ],
            "value": {
              "kind": "number",
              "max": 40,
              "min": 5,
              "step": 0.5,
              "unit": "C",
            },
            "writable": true,
          },
        ],
        "thermostatFanMode": [
          {
            "access": "read_write",
            "key": "fan_mode",
            "sources": [
              {
                "attribute": "thermostatFanMode",
                "capability": "thermostatFanMode",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "auto",
                "circulate",
                "followschedule",
                "on",
              ],
            },
            "writable": true,
          },
        ],
        "thermostatHeatingSetpoint": [
          {
            "access": "read_write",
            "key": "target_temperature",
            "sources": [
              {
                "attribute": "heatingSetpoint",
                "capability": "thermostatHeatingSetpoint",
              },
            ],
            "value": {
              "kind": "number",
              "max": 104,
              "min": 40,
              "step": 1,
              "unit": "F",
            },
            "writable": true,
          },
        ],
        "thermostatMode": [
          {
            "access": "read_write",
            "key": "hvac_mode",
            "sources": [
              {
                "attribute": "thermostatMode",
                "capability": "thermostatMode",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "auto",
                "cool",
                "eco",
                "rush hour",
                "emergency heat",
                "heat",
                "off",
              ],
            },
            "writable": true,
          },
        ],
        "tvChannel": [
          {
            "access": "read_write",
            "key": "channel",
            "sources": [
              {
                "attribute": "tvChannel",
                "capability": "tvChannel",
              },
            ],
            "value": {
              "kind": "number",
              "max": 9999,
              "min": 1,
              "step": 1,
            },
            "writable": true,
          },
        ],
        "tvocMeasurement": [
          {
            "access": "read",
            "key": "tvoc",
            "sources": [
              {
                "attribute": "tvocLevel",
                "capability": "tvocMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
            },
            "writable": false,
          },
        ],
        "voltageMeasurement": [
          {
            "access": "read",
            "key": "voltage",
            "sources": [
              {
                "attribute": "voltage",
                "capability": "voltageMeasurement",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100000,
              "min": 0,
              "step": 0.1,
              "unit": "V",
            },
            "writable": false,
          },
        ],
        "waterSensor": [
          {
            "access": "read",
            "key": "leak",
            "sources": [
              {
                "attribute": "water",
                "capability": "waterSensor",
              },
            ],
            "value": {
              "kind": "boolean",
            },
            "writable": false,
          },
        ],
        "windowShade": [
          {
            "access": "read_write",
            "key": "cover_action",
            "sources": [
              {
                "attribute": "windowShade",
                "capability": "windowShade",
              },
            ],
            "value": {
              "kind": "enum",
              "options": [
                "open",
                "close",
                "pause",
              ],
            },
            "writable": true,
          },
        ],
        "windowShadeLevel": [
          {
            "access": "read_write",
            "key": "cover_position",
            "sources": [
              {
                "attribute": "shadeLevel",
                "capability": "windowShadeLevel",
              },
            ],
            "value": {
              "kind": "number",
              "max": 100,
              "min": 0,
              "step": 1,
              "unit": "%",
            },
            "writable": true,
          },
        ],
      }
    `);
  });

  it('only produce value descriptors of the kind the catalogue declares', () => {
    for (const mapper of allMappers()) {
      for (const mapping of mapper.map(REPRESENTATIVE)) {
        expect(VALUE_DESCRIPTOR.parse(mapping.value).kind).toBe(
          CAPABILITY_CATALOGUE[mapping.key].kind,
        );
      }
    }
  });
});
