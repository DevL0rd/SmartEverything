export const HARNESS_STREAM_MEMORY_STATEMENTS: readonly string[] = [
  'drop table harness_consumers',
  'drop table harness_outbox',
  'alter table harness_deliveries drop column text',
];
