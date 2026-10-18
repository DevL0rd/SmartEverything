import { DEFAULT_PAUSE_MS, PAUSE_CHOICES_MS } from '@smarteverything/domain';

export const END_OF_SPEECH_PAUSE_STATEMENTS: readonly string[] = [
  `alter table settings add column end_of_speech_pause_ms integer not null default ${String(DEFAULT_PAUSE_MS)}
    check (end_of_speech_pause_ms in (${PAUSE_CHOICES_MS.join(', ')}))`,
];
