export const NATIVE_COMMAND_OPERATIONS_TABLES: readonly string[] = [
  `create table native_command_operations (
    operation_id text primary key, request text not null, receipt text not null
  ) strict`,
];
