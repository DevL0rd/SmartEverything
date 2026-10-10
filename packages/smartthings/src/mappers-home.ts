import type { JsonValue } from '@smarteverything/domain';
import { SmartThingsCommandError } from './errors';
import { enumControl, levelControl, toggle } from './mapper-factories';
import { PERCENT } from './mappers-lighting';
import {
  attributeValue,
  booleanOf,
  call,
  stringList,
  stringOf,
  type CapabilityMapper,
} from './mapper-kit';

const SHADE_COMMANDS = ['open', 'close', 'pause'] as const;

type ShadeCommand = (typeof SHADE_COMMANDS)[number];

const SHADE_STATES: ReadonlyMap<JsonValue | undefined, ShadeCommand> = new Map<
  JsonValue | undefined,
  ShadeCommand
>([
  ['open', 'open'],
  ['opening', 'open'],
  ['closed', 'close'],
  ['closing', 'close'],
  ['partially open', 'pause'],
]);

function shadeCommandOf(value: string): ShadeCommand {
  const command = SHADE_COMMANDS.find((name) => name === value);
  if (command === undefined) {
    throw new SmartThingsCommandError('windowShade', value, 'not open, close or pause');
  }
  return command;
}

const windowShadeMapper: CapabilityMapper = {
  capability: 'windowShade',
  attributes: ['windowShade', 'supportedWindowShadeCommands'],
  commands: [...SHADE_COMMANDS],
  map: (view) => {
    const reported = stringList(
      attributeValue(view.status, 'windowShade', 'supportedWindowShadeCommands'),
    );
    const supported = SHADE_COMMANDS.filter((name) => reported.includes(name));
    return [
      {
        key: 'cover_action',
        access: 'read_write',
        value: { kind: 'enum', options: supported.length > 0 ? supported : [...SHADE_COMMANDS] },
        sources: [{ capability: 'windowShade', attribute: 'windowShade' }],
        read: (status): JsonValue | undefined =>
          SHADE_STATES.get(attributeValue(status, 'windowShade', 'windowShade')),
        write: (value) => [call('windowShade', shadeCommandOf(stringOf('windowShade', value)))],
      },
    ];
  },
};

const alarmMapper: CapabilityMapper = {
  capability: 'alarm',
  attributes: ['alarm'],
  commands: ['both', 'off', 'siren', 'strobe'],
  map: () => [
    {
      key: 'siren',
      access: 'read_write',
      value: { kind: 'boolean' },
      sources: [{ capability: 'alarm', attribute: 'alarm' }],
      read: (status): JsonValue | undefined => {
        const state = attributeValue(status, 'alarm', 'alarm');
        return typeof state === 'string' ? state !== 'off' : undefined;
      },
      write: (value) => [call('alarm', booleanOf('alarm', value) ? 'both' : 'off')],
    },
  ],
};

const ROBOT_MOVEMENTS = [
  'cleaning',
  'homing',
  'pause',
  'idle',
  'charging',
  'alarm',
  'powerOff',
  'reserve',
  'point',
  'after',
];

export function homeMappers(): readonly CapabilityMapper[] {
  return [
    toggle({
      capability: 'lock',
      attribute: 'lock',
      key: 'lock',
      onValue: 'locked',
      onCommand: 'lock',
      offCommand: 'unlock',
      alsoCovers: [],
    }),
    windowShadeMapper,
    levelControl({
      capability: 'windowShadeLevel',
      attribute: 'shadeLevel',
      key: 'cover_position',
      command: 'setShadeLevel',
      range: PERCENT,
      unit: '%',
    }),
    enumControl({
      capability: 'robotCleanerMovement',
      attribute: 'robotCleanerMovement',
      key: 'cleaning',
      choices: { fixed: ROBOT_MOVEMENTS },
      command: 'setRobotCleanerMovement',
    }),
    enumControl({
      capability: 'robotCleanerTurboMode',
      attribute: 'robotCleanerTurboMode',
      key: 'suction',
      choices: { fixed: ['on', 'off', 'silence', 'extraSilence'] },
      command: 'setRobotCleanerTurboMode',
    }),
    enumControl({
      capability: 'button',
      attribute: 'button',
      key: 'button',
      choices: { reportedBy: 'supportedButtonValues', otherwise: ['pushed', 'held', 'double'] },
      command: null,
    }),
    alarmMapper,
  ];
}
