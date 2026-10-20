import type { FlowType } from '../automation-v3/types';
import { HEALTH_METRICS } from '../api/rows-access';
import { MEDIA_SIZES } from '../api/access';
import type { InputPortDecl, NodeKind, OutputPortDecl } from './define';
import { defineNodeKind } from './define';

const TEXT: FlowType = { t: 'text' };
const NUMBER: FlowType = { t: 'number' };

function reading(name: string, type: FlowType, description: string): OutputPortDecl {
  return { name, type, optional: true, description };
}

const CAMERA_SNAPSHOT = defineNodeKind({
  id: 'camera.snapshot',
  name: 'Camera picture',
  category: 'cameras',
  icon: 'camera',
  class: 'effect',
  description:
    'Takes a picture from a camera now. A camera that is offline or switched off for privacy gives an error and no picture.',
  inputs: [
    {
      name: 'camera',
      type: { t: 'ref', of: 'camera' },
      required: true,
      description: 'Which camera.',
      summary: true,
    },
    {
      name: 'size',
      type: {
        t: 'choice',
        options: MEDIA_SIZES.map((id) => ({ id, label: id === 'full' ? 'Full size' : 'Small' })),
      },
      required: false,
      default: 'full',
      static: true,
      description: 'Full size or a small picture.',
    },
  ],
  outputs: [
    {
      name: 'image',
      type: TEXT,
      description: 'The picture id. Give it to Look at picture or a push message.',
    },
    { name: 'at', type: { t: 'instant' }, description: 'When the picture was taken.' },
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: 'Take a picture from {camera}',
  keywords: ['camera', 'snapshot', 'picture', 'photo', 'image', 'doorbell'],
  access: 'member',
  tier: 'v1.1',
});

const WEATHER_FORECAST = defineNodeKind({
  id: 'weather.forecast',
  name: 'Forecast',
  category: 'cameras',
  icon: 'cloud-rain',
  class: 'read',
  description:
    'Reads the forecast for the next hours: the highest chance of rain, how many hours are likely to be wet, the lowest and highest temperature, the strongest wind, and the minimum and maximum of today.',
  inputs: [
    {
      name: 'hours',
      type: { t: 'number', integer: true, min: 1, max: 48, unit: 'h' },
      required: false,
      default: 3,
      static: true,
      description: 'How many hours ahead to look.',
      summary: true,
    },
    {
      name: 'rainAbove',
      type: { t: 'number', min: 0, max: 100, unit: '%' },
      required: false,
      default: 50,
      static: true,
      description: 'An hour counts as wet when its chance of rain is at least this.',
    },
  ],
  outputs: [
    reading(
      'rainChance',
      { t: 'number', min: 0, max: 100, unit: '%' },
      'The highest chance of rain.',
    ),
    reading(
      'rainHours',
      { t: 'number', integer: true, min: 0 },
      'How many hours are likely to be wet.',
    ),
    reading('minTemperature', { t: 'number', unit: '°C' }, 'The lowest temperature.'),
    reading('maxTemperature', { t: 'number', unit: '°C' }, 'The highest temperature.'),
    reading('maxWind', { t: 'number', min: 0, unit: 'km/h' }, 'The strongest wind.'),
    reading('todayMin', { t: 'number', unit: '°C' }, 'The minimum of today.'),
    reading('todayMax', { t: 'number', unit: '°C' }, 'The maximum of today.'),
  ],
  exits: [],
  summary: 'Forecast for {hours} hours',
  keywords: ['forecast', 'rain', 'tomorrow', 'tonight', 'next hours', 'weather'],
  reads: () => ['weather'],
  access: 'member',
  tier: 'v1.1',
});

const EVENT_NAME: InputPortDecl = {
  name: 'name',
  type: TEXT,
  required: true,
  static: true,
  summary: true,
  description: 'The name of the event, for example guests_arrived.',
};

const SIGNAL_EMIT = defineNodeKind({
  id: 'signal.emit',
  name: 'Send event',
  category: 'cameras',
  icon: 'megaphone',
  class: 'effect',
  description:
    'Sends a named event with data that other automations can start on or wait for. It is rate limited like other event sources.',
  inputs: [
    EVENT_NAME,
    {
      name: 'payload',
      type: { t: 'record', values: { t: 'any' } },
      required: false,
      default: {},
      description: 'Data that goes with the event.',
    },
  ],
  outputs: [],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Send the event {name}',
  keywords: ['event', 'signal', 'emit', 'broadcast', 'tell'],
  access: 'member',
  tier: 'v1.1',
});

const SIGNAL_LATEST = defineNodeKind({
  id: 'signal.latest',
  name: 'Latest signal value',
  category: 'cameras',
  icon: 'radio-receiver',
  class: 'read',
  description:
    'Reads the newest signal of one kind that this hub has seen since it started. It does not wake a Wait until true when a signal arrives: use Wait for event for that.',
  inputs: [
    {
      name: 'source',
      type: TEXT,
      required: true,
      static: true,
      summary: true,
      description: 'The signal source, for example device or weather.',
    },
    {
      name: 'kind',
      type: TEXT,
      required: true,
      static: true,
      summary: true,
      description: 'The signal kind within the source.',
    },
    {
      name: 'subject',
      type: { t: 'optional', of: TEXT },
      required: false,
      static: true,
      description: 'Only this subject.',
    },
    {
      name: 'field',
      type: { t: 'optional', of: TEXT },
      required: false,
      static: true,
      description: 'Only this field.',
    },
  ],
  outputs: [
    { name: 'found', type: { t: 'boolean' }, description: 'Whether such a signal has been seen.' },
    reading('value', { t: 'any' }, 'The value of the signal.'),
    reading('previous', { t: 'any' }, 'The value before it.'),
    reading('subject', TEXT, 'The subject of the signal.'),
    reading('at', { t: 'instant' }, 'When the signal arrived.'),
    reading('data', { t: 'record', values: { t: 'any' } }, 'The match details of the signal.'),
  ],
  exits: [],
  summary: 'Latest {kind} from {source}',
  keywords: ['signal', 'last', 'latest', 'event', 'outcome'],
  access: 'member',
  tier: 'v1.1',
});

const HEALTH_READ = defineNodeKind({
  id: 'health.read',
  name: 'Health value',
  category: 'cameras',
  icon: 'heart-pulse',
  class: 'effect',
  description:
    'Reads a health figure of one person for the newest day that has it, such as steps today.',
  inputs: [
    {
      name: 'person',
      type: { t: 'ref', of: 'person' },
      required: true,
      static: true,
      description: 'Whose health.',
      summary: true,
    },
    {
      name: 'metric',
      type: {
        t: 'choice',
        options: HEALTH_METRICS.map((id) => ({ id, label: id.replaceAll('_', ' ') })),
      },
      required: true,
      static: true,
      description: 'Which figure.',
      summary: true,
    },
    {
      name: 'withinDays',
      type: { t: 'number', integer: true, min: 1, max: 365 },
      required: false,
      default: 1,
      static: true,
      description: 'How many days back to look for the newest figure.',
    },
  ],
  outputs: [
    { name: 'found', type: { t: 'boolean' }, description: 'Whether there is such a figure.' },
    reading('value', NUMBER, 'The figure.'),
    reading('unit', TEXT, 'Its unit.'),
    reading('day', { t: 'date' }, 'The day it belongs to.'),
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects' },
  summary: '{metric} of {person}',
  keywords: ['health', 'steps', 'sleep', 'heart', 'weight', 'fitness'],
  access: 'member',
  tier: 'v1.1',
});

export const CAMERA_SIGNAL_KINDS: readonly NodeKind[] = [
  CAMERA_SNAPSHOT,
  WEATHER_FORECAST,
  SIGNAL_EMIT,
  SIGNAL_LATEST,
  HEALTH_READ,
];
