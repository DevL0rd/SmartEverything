export const EXCHANGE_RATES_TABLES: readonly string[] = [
  `create table exchange_rates (
    id text primary key check (id = 'usd'),
    rates text check (rates is null or (json_valid(rates) and json_type(rates) = 'object')),
    rate_date text,
    fetched_at text,
    next_fetch_at text,
    error text,
    failed_at text,
    updated_at text not null
  ) strict`,
];
