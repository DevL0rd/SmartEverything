export const DROP_INCLINE_CONTROL: readonly string[] = [
  `update local_devices
   set config = json_remove(config, '$.settings.inclineControl')
   where driver = 'kingsmith_treadmill'`,
];
