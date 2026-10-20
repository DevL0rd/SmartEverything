export const END_OF_SPEECH_PAUSE_STATEMENTS: readonly string[] = [
  `alter table settings add column end_of_speech_pause_ms integer not null default 200
    check (end_of_speech_pause_ms in (200, 320, 640, 1000, 2500))`,
];
