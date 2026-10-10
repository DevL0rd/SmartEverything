import { z } from 'zod';

export const WAKE_SENSITIVITIES = ['standard', 'high', 'highest'] as const;

export const WAKE_SENSITIVITY = z
  .enum(WAKE_SENSITIVITIES)
  .describe(
    'How readily this camera hears the AI’s name: standard, high for a quiet or distant microphone, highest for the faintest calls (more false wakes)',
  );

export type WakeSensitivity = z.infer<typeof WAKE_SENSITIVITY>;

export const DEFAULT_WAKE_SENSITIVITY: WakeSensitivity = 'standard';

export const WAKE_SENSITIVITY_LABELS: Readonly<Record<WakeSensitivity, string>> = {
  standard: 'Standard',
  high: 'High',
  highest: 'Highest',
};

export const WAKE_SENSITIVITY_HINTS: Readonly<Record<WakeSensitivity, string>> = {
  standard: 'Fewest false wakes',
  high: 'For a quiet or distant microphone',
  highest: 'Hears faint calls, may wake on similar words',
};
