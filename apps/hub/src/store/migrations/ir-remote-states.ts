export const IR_REMOTE_STATES_COLUMNS: readonly string[] = [
  `alter table settings add column ir_remotes text not null default '{}'
    check (json_valid(ir_remotes) and json_type(ir_remotes) = 'object')`,
];
