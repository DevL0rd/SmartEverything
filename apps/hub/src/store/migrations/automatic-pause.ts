export const AUTOMATIC_PAUSE_STATEMENTS: readonly string[] = [
  'alter table settings add column end_of_speech_pause_kept integer',
  'update settings set end_of_speech_pause_kept = case end_of_speech_pause_ms when 200 then 0 else end_of_speech_pause_ms end',
  'alter table settings drop column end_of_speech_pause_ms',
  `alter table settings add column end_of_speech_pause_ms integer not null default 0
    check (end_of_speech_pause_ms in (0, 200, 320, 640, 1000, 2500))`,
  'update settings set end_of_speech_pause_ms = end_of_speech_pause_kept where end_of_speech_pause_kept is not null',
  'alter table settings drop column end_of_speech_pause_kept',
];
