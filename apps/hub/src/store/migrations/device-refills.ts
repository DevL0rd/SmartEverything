export const DEVICE_REFILLS_COLUMNS: readonly string[] = [
  `alter table settings add column device_refills text not null default '{}'
    check (json_valid(device_refills) and json_type(device_refills) = 'object')`,
];
