export const LOCATION_NAME_COLUMNS: readonly string[] = [
  `alter table settings add column location_name text
    check (location_name is null or length(location_name) between 1 and 120)`,
];
