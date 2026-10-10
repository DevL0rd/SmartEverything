export const STEP_STATE_COLUMNS: readonly string[] = [
  `alter table assistant_messages add column step_states text not null default '[]'
    check (json_valid(step_states) and json_type(step_states) = 'array')`,
];
