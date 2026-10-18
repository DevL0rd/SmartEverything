export const PROVIDER_PROGRESS_COLUMNS: readonly string[] = [
  "alter table provider_links add column phase text check (phase is null or phase in ('signing_in', 'awaiting_answer', 'discovering'))",
  "alter table provider_links add column problem text check (problem is null or problem in ('bad_credentials', 'permission_denied', 'network', 'session_expired', 'qr_expired', 'cancelled', 'rate_limited', 'not_supported', 'unknown'))",
];
