import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, JSON_OBJECT, NAMED } = COLUMN_TYPES;

const OPTIONAL_JSON = (column: string): string =>
  `${column} text check (${column} is null or (json_valid(${column}) and json_type(${column}) = 'object'))`;

export const NUTRITION_TABLES: readonly string[] = [
  `create table health_entries (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    record_type text not null,
    start_time text not null,
    end_time text,
    zone_offset_seconds integer,
    ${JSON_OBJECT('data')},
    ${OPTIONAL_JSON('food')},
    version integer not null default 1 check (version >= 1),
    created_at text not null,
    updated_at text not null,
    deleted_at text
  ) strict`,
  'create index health_entries_profile_idx on health_entries (profile_id, start_time)',
  `create table health_entry_writes (
    entry_id text not null references health_entries (id) on delete cascade,
    source_id text not null references health_sources (id) on delete cascade,
    version integer not null check (version >= 1),
    written_at text not null,
    primary key (entry_id, source_id)
  ) strict, without rowid`,
  `create table foods (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    ${NAMED('name', 120)},
    brand text check (brand is null or length(brand) between 1 and 120),
    barcode text check (barcode is null or length(barcode) between 8 and 14),
    kind text not null check (kind in ('food', 'drink')),
    ${JSON_OBJECT('basis')},
    ${OPTIONAL_JSON('serving')},
    kcal real check (kcal is null or kcal >= 0),
    ${JSON_OBJECT('grams')},
    water_percent integer not null check (water_percent between 0 and 100),
    origin text not null check (origin in ('custom', 'open_food_facts')),
    ${BOOLEAN('favourite')} default 0,
    last_used_at text,
    created_at text not null,
    updated_at text not null
  ) strict`,
  'create index foods_profile_idx on foods (profile_id, last_used_at)',
  'create unique index foods_barcode_idx on foods (profile_id, barcode) where barcode is not null',
  `create table food_lookups (
    key text primary key,
    answer text check (answer is null or json_valid(answer)),
    fetched_at text not null
  ) strict, without rowid`,
];
