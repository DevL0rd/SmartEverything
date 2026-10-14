export const EVENT_OCCURRENCE_COLUMNS = [
  'alter table events add column occurrence_key text',
  'create unique index events_occurrence_key on events (occurrence_key) where occurrence_key is not null',
];
