export const VOICE_HISTORY_COLUMNS: readonly string[] = [
  `update assistant_settings
   set settings = json_remove(settings, '$.voice.memory_lines', '$.voice.context_minutes')`,
];
