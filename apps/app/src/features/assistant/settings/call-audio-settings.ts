import { createElement, type ReactNode } from 'react';
import { router, type Href } from 'expo-router';
import type { IconName } from '../../../components/icon';
import type { SettingDefinition } from '../../../settings/types';
import { callAudioOf, saveCallAudio } from '../call/settings-sheet/call-audio-pref';
import { DetectionRow } from '../call/settings-sheet/detection-row';
import { DEVICE_ROWS, type RowEntry } from '../call/settings-sheet/device-row-set';
import { EchoChoiceRows } from '../call/settings-sheet/echo-rows';
import { EchoTestRow } from '../call/settings-sheet/echo-test-row';
import { VIDEO_ROWS } from '../call/settings-sheet/video-row-set';

const PAGE = 'assistant/calls';

export const CALL_AUDIO_SECTIONS = {
  listening: 'Listening',
  echo: 'Echo',
  devices: 'Devices and volume',
  video: 'What it sees',
  start: 'Start a call with',
} as const;

interface ToggleSpec {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly key: 'noise_suppression' | 'auto_gain';
}

function toggle(spec: ToggleSpec): SettingDefinition {
  return {
    id: spec.id,
    page: PAGE,
    icon: 'audioLines',
    section: CALL_AUDIO_SECTIONS.listening,
    title: spec.title,
    description: spec.description,
    keywords: spec.keywords,
    scope: 'client',
    control: 'switch',
    read: (state) => callAudioOf(state)[spec.key],
    write: (value, context): Promise<void> => {
      saveCallAudio(
        context.store,
        { [spec.key]: value },
        `${spec.title} · ${value ? 'on' : 'off'}`,
      );
      return Promise.resolve();
    },
  };
}

interface RowSpec extends RowEntry {
  readonly section: string;
}

function custom(spec: RowSpec): SettingDefinition {
  return {
    id: spec.id,
    page: PAGE,
    section: spec.section,
    title: spec.title,
    keywords: spec.keywords,
    scope: 'client',
    control: 'custom',
    row: true,
    render: (): ReactNode => createElement(spec.component),
  };
}

interface ActionSpec {
  readonly id: string;
  readonly icon: IconName;
  readonly title: string;
  readonly action: string;
  readonly keywords: readonly string[];
}

function startAction(spec: ActionSpec): SettingDefinition {
  const href: Href = {
    pathname: '/assistant/call',
    params: { source: 'chat', action: spec.action },
  };
  return {
    id: spec.id,
    page: PAGE,
    icon: spec.icon,
    section: CALL_AUDIO_SECTIONS.start,
    title: spec.title,
    keywords: spec.keywords,
    scope: 'client',
    control: 'action',
    run: (): Promise<void> => {
      router.push(href);
      return Promise.resolve();
    },
  };
}

const LISTENING_ROWS: readonly RowEntry[] = [
  {
    id: 'call.detection',
    title: 'Voice detection',
    keywords: [
      'voice detection',
      'vad',
      'sensitivity',
      'doesn’t hear me',
      'hears the tv',
      'picks up',
      'quiet voice',
    ],
    component: DetectionRow,
  },
];

const ECHO_ROWS: readonly RowEntry[] = [
  {
    id: 'call.echo',
    title: 'Echo handling',
    keywords: [
      'echo',
      'echo back',
      'feedback',
      'hearing itself',
      'interrupts itself',
      'talks over me',
      'barge in',
      'headphones',
      'speakerphone',
      'don’t interrupt',
    ],
    component: EchoChoiceRows,
  },
  {
    id: 'call.echo-test',
    title: 'Test echo on this device',
    keywords: ['echo test', 'test echo', 'measure echo', 'speaker test'],
    component: EchoTestRow,
  },
];

const START_ACTIONS: readonly ActionSpec[] = [
  {
    id: 'call.start-camera',
    icon: 'camera',
    title: 'Turn on camera in a call',
    action: 'camera',
    keywords: ['video call', 'camera', 'show something', 'look', 'see'],
  },
  {
    id: 'call.start-share',
    icon: 'screenShare',
    title: 'Share screen in a call',
    action: 'share',
    keywords: ['share screen', 'screen share', 'show my screen', 'desktop', 'window'],
  },
  {
    id: 'call.start-home-camera',
    icon: 'house',
    title: 'Show a home camera in a call',
    action: 'home',
    keywords: ['home camera', 'camera view', 'show camera'],
  },
  {
    id: 'call.start-settings',
    icon: 'settings',
    title: 'Open call settings in a call',
    action: 'settings',
    keywords: ['call settings', 'in call'],
  },
];

export const CALL_AUDIO_SETTINGS: readonly SettingDefinition[] = [
  ...LISTENING_ROWS.map((row) => custom({ ...row, section: CALL_AUDIO_SECTIONS.listening })),
  toggle({
    id: 'call.noise',
    title: 'Noise suppression',
    description: 'Removes steady noise like fans. Turn off if your voice sounds choppy.',
    keywords: ['noise', 'background noise', 'fan', 'hiss', 'choppy'],
    key: 'noise_suppression',
  }),
  toggle({
    id: 'call.gain',
    title: 'Even out my volume',
    description: 'Raises quiet speech and lowers loud speech.',
    keywords: ['agc', 'gain', 'automatic gain', 'volume too low', 'volume too loud', 'level'],
    key: 'auto_gain',
  }),
  ...ECHO_ROWS.map((row) => custom({ ...row, section: CALL_AUDIO_SECTIONS.echo })),
  ...DEVICE_ROWS.map((row) => custom({ ...row, section: CALL_AUDIO_SECTIONS.devices })),
  ...VIDEO_ROWS.map((row) => custom({ ...row, section: CALL_AUDIO_SECTIONS.video })),
  ...START_ACTIONS.map(startAction),
];
