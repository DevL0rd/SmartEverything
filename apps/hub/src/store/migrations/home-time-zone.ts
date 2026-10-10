export const HOME_TIME_ZONE_COLUMNS: readonly string[] = [
  `alter table settings add column time_zone_initialised integer not null default 0
    check (time_zone_initialised in (0, 1))`,
];
