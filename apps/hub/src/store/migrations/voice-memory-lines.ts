export const VOICE_MEMORY_LINES: readonly string[] = [
  `update assistant_settings set settings = json_set(settings, '$.voice.memory_lines', 15)
   where json_extract(settings, '$.voice.memory_lines') = 40`,
];
