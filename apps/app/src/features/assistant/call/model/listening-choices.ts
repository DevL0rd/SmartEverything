import type { EchoMode, EchoTestOutcome, VoiceDetection } from '@smarteverything/domain';

export interface EchoChoice {
  readonly value: EchoMode;
  readonly title: string;
  readonly hint: string;
}

export const ECHO_CHOICES: readonly EchoChoice[] = [
  {
    value: 'headphones',
    title: 'Headphones',
    hint: 'No echo handling. Interrupt the assistant any time.',
  },
  {
    value: 'normal',
    title: 'Normal',
    hint: 'Cancels echo from your speaker. You can interrupt by speaking up.',
  },
  {
    value: 'strong',
    title: 'Strong',
    hint: 'For loud speakers or echoey rooms. Interrupting needs a clear, louder voice.',
  },
  {
    value: 'no_interrupt',
    title: 'Don’t interrupt',
    hint: 'The assistant finishes before it listens. Tap the orb to stop it.',
  },
];

export const DETECTION_LABELS: Readonly<Record<VoiceDetection, string>> = {
  less: 'Less sensitive',
  standard: 'Standard',
  more: 'More sensitive',
};

export const DETECTION_SEGMENTS: Readonly<Record<VoiceDetection, string>> = {
  less: 'Less',
  standard: 'Standard',
  more: 'More',
};

export const DETECTION_HINTS: Readonly<Record<VoiceDetection, string>> = {
  less: 'Ignores quieter voices and background talk.',
  standard: 'Works for most rooms.',
  more: 'Picks up quiet or distant speech; may react to TV or other people.',
};

export interface EchoOutcomeCopy {
  readonly title: string;
  readonly body: string;
  readonly tone: 'positive' | 'warning' | 'critical' | 'info';
  readonly suggest: EchoMode | null;
  readonly suggestLabel: string | null;
}

export const ECHO_OUTCOMES: Readonly<Record<EchoTestOutcome, EchoOutcomeCopy>> = {
  none: {
    title: 'No echo heard',
    body: 'Your speaker isn’t reaching the microphone. Headphones mode would let you interrupt freely.',
    tone: 'positive',
    suggest: 'headphones',
    suggestLabel: 'Use Headphones',
  },
  some: {
    title: 'Some echo',
    body: 'A little of the assistant’s voice comes back. Strong handles this.',
    tone: 'warning',
    suggest: 'strong',
    suggestLabel: 'Use Strong',
  },
  strong: {
    title: 'Strong echo',
    body: 'The microphone hears the speaker clearly. Lower the volume, use headphones, or choose Don’t interrupt.',
    tone: 'critical',
    suggest: 'no_interrupt',
    suggestLabel: 'Use Don’t interrupt',
  },
  failed: {
    title: 'Couldn’t test',
    body: 'It’s too noisy to measure. Try again in a quieter moment.',
    tone: 'info',
    suggest: null,
    suggestLabel: null,
  },
};

export const ECHO_TEST_SECONDS = 4;

export function outcomeWords(outcome: EchoTestOutcome): string {
  switch (outcome) {
    case 'none':
      return 'no echo';
    case 'some':
      return 'little echo';
    case 'strong':
      return 'strong echo';
    case 'failed':
      return 'could not test';
  }
}
