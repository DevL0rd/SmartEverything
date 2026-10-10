import type { ReactNode } from 'react';
import { MicrophoneRow, SpeakerRow, VolumeRow } from './device-rows';

export interface RowEntry {
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly component: () => ReactNode;
}

export const DEVICE_ROWS: readonly RowEntry[] = [
  {
    id: 'call.microphone',
    title: 'Microphone',
    keywords: ['microphone', 'mic', 'headset', 'bluetooth', 'earbuds', 'input'],
    component: MicrophoneRow,
  },
  {
    id: 'call.speaker',
    title: 'Speaker',
    keywords: ['speaker', 'earpiece', 'output', 'bluetooth', 'earbuds', 'headphones'],
    component: SpeakerRow,
  },
  {
    id: 'call.volume',
    title: 'Assistant volume',
    keywords: ['volume', 'loud', 'quiet', 'too quiet', 'too loud'],
    component: VolumeRow,
  },
];
