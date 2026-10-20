export const ACCESS_REQUEST_LAPSE_STATEMENTS: readonly string[] = [
  'alter table access_requests add column lapsed_at text',
  `create index access_requests_lapsing on access_requests (until)
     where status = 'approved' and until is not null and lapsed_at is null`,
];
