import { COLUMN_TYPES } from './core-tables';
import type { Migration } from './migration';

const { NAMED } = COLUMN_TYPES;

export const IR_APPLIANCES_MIGRATION: Migration = {
  version: 142,
  name: 'ir_appliances',
  statements: [
    `create table ir_appliances (
      id text primary key,
      blaster_id text references devices (id) on delete set null,
      ${NAMED('name', 80)},
      category text not null check (length(category) between 1 and 40),
      brand text check (brand is null or length(brand) between 1 and 80),
      encoder text not null check (length(encoder) between 1 and 120),
      created_at text not null
    ) strict`,
    'create index ir_appliances_blaster_idx on ir_appliances (blaster_id)',
    `create table ir_appliance_keys (
      id text primary key,
      appliance_id text not null references ir_appliances (id) on delete cascade,
      ${NAMED('button', 60)},
      format text not null check (format in ('pulses', 'head_key')),
      code text not null check (length(code) >= 1),
      created_at text not null,
      unique (appliance_id, button)
    ) strict`,
  ],
};
