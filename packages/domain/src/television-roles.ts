export const TV_ROLES = [
  'current_app',
  'picture_mode',
  'sound_mode',
  'ambient_mode',
  'light_sync_mode',
  'tv_category',
  'power_on_remote',
  'tv_updating',
] as const;

export type TvRole = (typeof TV_ROLES)[number];
