export const CAMERA_WAKE_SENSITIVITY_COLUMNS: readonly string[] = [
  `alter table cameras add column wake_sensitivity text not null
    default 'standard' check (wake_sensitivity in ('standard', 'high', 'highest'))`,
];
