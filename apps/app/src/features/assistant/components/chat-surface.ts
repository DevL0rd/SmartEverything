import type { ParticipantInk } from '../model/participant';

export const CHAT_SURFACE = 'rounded-md bg-surface-1 light:border light:border-outline-variant';

export const CHAT_SURFACE_IN_BUBBLE = 'rounded-md bg-on-primary-container/8';

export const INK_TEXT: Readonly<Record<ParticipantInk, string>> = {
  primary: 'text-primary',
  'viz-1': 'text-viz-1',
  'viz-2': 'text-viz-2',
  'viz-3': 'text-viz-3',
  'viz-5': 'text-viz-5',
  'viz-6': 'text-viz-6',
};

export const INK_RAIL: Readonly<Record<ParticipantInk, string>> = {
  primary: 'bg-primary',
  'viz-1': 'bg-viz-1',
  'viz-2': 'bg-viz-2',
  'viz-3': 'bg-viz-3',
  'viz-5': 'bg-viz-5',
  'viz-6': 'bg-viz-6',
};

export const INK_MENTION: Readonly<Record<ParticipantInk, string>> = {
  primary: 'bg-primary/13',
  'viz-1': 'bg-viz-1/13',
  'viz-2': 'bg-viz-2/13',
  'viz-3': 'bg-viz-3/13',
  'viz-5': 'bg-viz-5/13',
  'viz-6': 'bg-viz-6/13',
};

export const SELF_MENTION = 'bg-primary/22 font-sans-semibold text-on-surface';
