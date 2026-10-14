import { createElement } from 'react';
import { href } from '../../app-shell/hrefs';
import type { SettingDefinition } from '../../settings/types';
import { ListeningRows } from './transcripts/listening-rows';
import { BudgetRow, RetentionRow } from './transcripts/keep-rows';
import { TranscriptList } from './transcripts/transcript-list';

const hasCameras = (env: { readonly availability: { readonly hasCameras: boolean } }): boolean =>
  env.availability.hasCameras;

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'cameras.list',
    page: 'cameras',
    title: 'Camera options',
    description:
      'Event clips, wake sensitivity, transcripts, night vision, detection, privacy and memory card',
    keywords: [
      'save event clips',
      'transcribe what it hears',
      'wake sensitivity',
      'wake word',
      'hey',
      'recording',
      'night vision',
      'privacy',
      'motion',
      'memory card',
      'format',
      'restart',
    ],
    scope: 'device',
    control: 'link',
    href: href.settings.cameras(),
    visible: hasCameras,
  },
  {
    id: 'cameras.remote-viewing',
    page: 'cameras/remote-viewing',
    title: 'Camera connection',
    description: 'Automatic video, relay servers and extra WebRTC addresses',
    keywords: ['connection', 'automatic', 'relay', 'stun', 'turn', 'ice', 'webrtc'],
    scope: 'client',
    control: 'link',
    href: href.settings.remoteViewing(),
    visible: hasCameras,
  },
  {
    id: 'cameras.transcripts.listening',
    page: 'cameras/transcripts',
    title: 'What cameras hear',
    keywords: ['transcribe what it hears', 'listening', 'microphone', 'paused', 'privacy'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(ListeningRows),
  },
  {
    id: 'cameras.transcripts.retention',
    page: 'cameras/transcripts',
    section: 'Keep and spend',
    title: 'Keep camera transcripts',
    keywords: ['retention', 'delete after', 'days', 'history', 'how long'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(RetentionRow),
  },
  {
    id: 'cameras.transcripts.budget',
    page: 'cameras/transcripts',
    section: 'Keep and spend',
    title: 'Daily transcribing budget',
    keywords: ['cap', 'limit', 'cost', 'spend', 'dollars', 'money', 'budget'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(BudgetRow),
  },
  {
    id: 'cameras.transcripts.list',
    page: 'cameras/transcripts',
    title: 'Transcripts',
    keywords: ['what was said', 'search', 'speech to text', 'captions', 'conversation', 'delete'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(TranscriptList),
  },
];
