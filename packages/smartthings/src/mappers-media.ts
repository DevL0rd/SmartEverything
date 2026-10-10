import type { JsonValue } from '@smarteverything/domain';
import { SmartThingsCommandError } from './errors';
import { enumControl, levelControl, toggle, type NumberRange } from './mapper-factories';
import { PERCENT } from './mappers-lighting';
import {
  attributeValue,
  call,
  isJsonList,
  isJsonRecord,
  numberOf,
  readString,
  stringList,
  stringOf,
  type CapabilityMapper,
  type CommandCall,
  type ComponentView,
} from './mapper-kit';
import { TV_APP_NAMES, tvAppNamed } from './samsung-tv/catalogue';

const CHANNELS: NumberRange = { min: 1, max: 9999, step: 1 };

const PLAYBACK = {
  play: 'playing',
  pause: 'paused',
  stop: 'stopped',
  fastForward: 'fast forwarding',
  rewind: 'rewinding',
} as const;

type PlaybackCommand = keyof typeof PLAYBACK;

const PLAYBACK_COMMANDS: readonly PlaybackCommand[] = [
  'play',
  'pause',
  'stop',
  'fastForward',
  'rewind',
];

const MEDIA_INPUT_SOURCES = [
  'AM',
  'CD',
  'FM',
  'HDMI',
  'HDMI1',
  'HDMI2',
  'HDMI3',
  'HDMI4',
  'HDMI5',
  'HDMI6',
  'digitalTv',
  'USB',
  'YouTube',
  'aux',
  'bluetooth',
  'digital',
  'melon',
  'wifi',
];

function playbackCommandFor(status: string): PlaybackCommand {
  const command = PLAYBACK_COMMANDS.find((name) => PLAYBACK[name] === status);
  if (command === undefined) {
    throw new SmartThingsCommandError('mediaPlayback', status, 'not a playback status');
  }
  return command;
}

function supportedPlayback(view: ComponentView): readonly PlaybackCommand[] {
  const reported = stringList(
    attributeValue(view.status, 'mediaPlayback', 'supportedPlaybackCommands'),
  );
  const known = PLAYBACK_COMMANDS.filter((name) => reported.includes(name));
  return known.length > 0 ? known : PLAYBACK_COMMANDS;
}

const mediaPlaybackMapper: CapabilityMapper = {
  capability: 'mediaPlayback',
  attributes: ['playbackStatus', 'supportedPlaybackCommands'],
  commands: [...PLAYBACK_COMMANDS, 'setPlaybackStatus'],
  map: (view) => [
    {
      key: 'playback',
      access: 'read_write',
      value: { kind: 'enum', options: supportedPlayback(view).map((name) => PLAYBACK[name]) },
      sources: [{ capability: 'mediaPlayback', attribute: 'playbackStatus' }],
      read: readString('mediaPlayback', 'playbackStatus'),
      write: (value) => [
        call('mediaPlayback', playbackCommandFor(stringOf('mediaPlayback', value))),
      ],
    },
  ],
};

function inputSourceIds(value: JsonValue | undefined): readonly string[] {
  if (!isJsonList(value)) {
    return [];
  }
  return value.flatMap((entry): readonly string[] =>
    isJsonRecord(entry) && typeof entry['id'] === 'string' ? [entry['id']] : [],
  );
}

function withCurrent(options: readonly string[], current: JsonValue | undefined): string[] {
  return typeof current === 'string' && current !== '' && !options.includes(current)
    ? [...options, current]
    : [...options];
}

const samsungInputSourceMapper: CapabilityMapper = {
  capability: 'samsungvd.mediaInputSource',
  attributes: ['inputSource', 'supportedInputSourcesMap'],
  commands: ['setInputSource'],
  map: (view) => {
    const options = withCurrent(
      inputSourceIds(
        attributeValue(view.status, 'samsungvd.mediaInputSource', 'supportedInputSourcesMap'),
      ),
      attributeValue(view.status, 'samsungvd.mediaInputSource', 'inputSource'),
    );
    if (options.length === 0) {
      return [];
    }
    return [
      {
        key: 'input_source',
        access: 'read_write',
        value: { kind: 'enum', options },
        sources: [{ capability: 'samsungvd.mediaInputSource', attribute: 'inputSource' }],
        read: readString('samsungvd.mediaInputSource', 'inputSource'),
        write: (value) => [
          call('samsungvd.mediaInputSource', 'setInputSource', [
            stringOf('samsungvd.mediaInputSource', value),
          ]),
        ],
      },
    ];
  },
};

const tvChannelMapper: CapabilityMapper = {
  capability: 'tvChannel',
  attributes: ['tvChannel'],
  commands: ['setTvChannel'],
  map: () => [
    {
      key: 'channel',
      access: 'read_write',
      value: { kind: 'number', ...CHANNELS },
      sources: [{ capability: 'tvChannel', attribute: 'tvChannel' }],
      read: (status): JsonValue | undefined => {
        const channel = attributeValue(status, 'tvChannel', 'tvChannel');
        return typeof channel === 'string' && /^\d+$/.test(channel) ? Number(channel) : undefined;
      },
      write: (value) => [call('tvChannel', 'setTvChannel', [String(numberOf('tvChannel', value))])],
    },
  ],
};

const launchAppMapper: CapabilityMapper = {
  capability: 'custom.launchapp',
  attributes: [],
  commands: ['launchApp'],
  map: () => [
    {
      key: 'app_launch',
      access: 'write',
      value: { kind: 'enum', options: [...TV_APP_NAMES] },
      sources: [],
      read: () => undefined,
      write: (value): readonly CommandCall[] => {
        const name = stringOf('custom.launchapp', value);
        const app = tvAppNamed(name);
        if (app === undefined) {
          throw new SmartThingsCommandError('custom.launchapp', value, 'not a known app');
        }
        return [call('custom.launchapp', 'launchApp', [app.ids[0], app.name])];
      },
    },
  ],
};

const REMOTE_KEYS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'OK', 'BACK', 'MENU', 'HOME'];

const remoteControlMapper: CapabilityMapper = {
  capability: 'samsungvd.remoteControl',
  attributes: [],
  commands: ['send'],
  map: () => [
    {
      key: 'remote_key',
      access: 'write',
      value: { kind: 'enum', options: REMOTE_KEYS },
      sources: [],
      read: () => undefined,
      write: (value): readonly CommandCall[] => {
        const key = stringOf('samsungvd.remoteControl', value);
        if (!REMOTE_KEYS.includes(key)) {
          throw new SmartThingsCommandError('samsungvd.remoteControl', value, 'not a remote key');
        }
        return [call('samsungvd.remoteControl', 'send', [key, 'PRESS_AND_RELEASED'])];
      },
    },
  ],
};

export function mediaMappers(): readonly CapabilityMapper[] {
  return [
    levelControl({
      capability: 'audioVolume',
      attribute: 'volume',
      key: 'volume',
      command: 'setVolume',
      range: PERCENT,
      unit: '%',
    }),
    toggle({
      capability: 'audioMute',
      attribute: 'mute',
      key: 'mute',
      onValue: 'muted',
      onCommand: 'mute',
      offCommand: 'unmute',
      alsoCovers: ['setMute'],
    }),
    mediaPlaybackMapper,
    samsungInputSourceMapper,
    enumControl({
      capability: 'mediaInputSource',
      attribute: 'inputSource',
      key: 'input_source',
      choices: { reportedBy: 'supportedInputSources', otherwise: MEDIA_INPUT_SOURCES },
      command: 'setInputSource',
    }),
    tvChannelMapper,
    launchAppMapper,
    remoteControlMapper,
  ];
}
