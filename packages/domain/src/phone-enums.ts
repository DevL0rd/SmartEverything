import { z } from 'zod';

export const PERCENT = z.int().min(0).max(100);

export const PHONE_NETWORKS = ['wifi', 'cellular', 'ethernet', 'other', 'offline'] as const;

export const PHONE_PLAYBACK = ['playing', 'paused', 'stopped'] as const;

export const PHONE_CHARGERS = ['none', 'ac', 'usb', 'wireless', 'dock'] as const;

export const PHONE_THERMAL_STATES = ['normal', 'light', 'moderate', 'severe', 'critical'] as const;

export const PHONE_AUDIO_OUTPUTS = [
  'speaker',
  'wired',
  'bluetooth',
  'car',
  'usb',
  'other',
] as const;

export const PHONE_TORCH_STATES = ['on', 'off'] as const;

export const PHONE_SIGNAL_BARS_MOST = 4;
