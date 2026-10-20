import type { Migration } from './migration';

export const LAUNDRY_NOTICES_MIGRATION: Migration = {
  version: 132,
  name: 'laundry_notices',
  statements: [
    `alter table settings add column laundry_notices text not null default '{}'
      check (json_valid(laundry_notices) and json_type(laundry_notices) = 'object')`,
  ],
};
