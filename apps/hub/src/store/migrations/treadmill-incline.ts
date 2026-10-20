export const TREADMILL_INCLINE_COLUMNS: readonly string[] = [
  'alter table treadmill_samples add column incline_raw real check (incline_raw is null or incline_raw >= 0)',
];
