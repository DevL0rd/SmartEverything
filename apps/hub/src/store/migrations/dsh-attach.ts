export const DSH_ATTACH_STATEMENTS: readonly string[] = [
  'update dsh_sessions set claim = null',
  'drop table dsh_session_claim_receipts',
  'drop table harness_admissions',
  'drop table harness_openings',
  'alter table dsh_sessions drop column composition',
  'alter table dsh_sessions drop column claim_state',
  'alter table dsh_sessions drop column acquire_operation',
  'alter table dsh_sessions drop column creation_request',
];
