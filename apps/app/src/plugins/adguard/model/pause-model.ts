export interface PauseChoice {
  readonly minutes: number;
  readonly chip: string;
  readonly spoken: string;
}

export const PAUSE_CHOICES: readonly PauseChoice[] = [
  { minutes: 15, chip: '15 min', spoken: '15 minutes' },
  { minutes: 60, chip: '1 h', spoken: '1 hour' },
  { minutes: 480, chip: '8 h', spoken: '8 hours' },
  { minutes: 1440, chip: '24 h', spoken: '24 hours' },
];

export function pausedMessage(choice: PauseChoice): string {
  return `Ad blocking paused for ${choice.spoken}`;
}
