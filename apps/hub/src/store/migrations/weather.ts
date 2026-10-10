export const WEATHER_TABLES: readonly string[] = [
  `create table weather (
    id text primary key check (id = 'home'),
    forecast text check (forecast is null or (json_valid(forecast) and json_type(forecast) = 'object')),
    fetched_at text,
    next_fetch_at text,
    error text,
    air_error text,
    failed_at text,
    updated_at text not null
  ) strict`,
];
