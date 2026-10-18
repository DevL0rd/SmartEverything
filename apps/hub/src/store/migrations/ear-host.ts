export const EAR_HOST_STATEMENTS: readonly string[] = [
  'alter table settings add column ear_host_device_id text references devices(id) on delete set null',
];
