export const CLIENT_KIND_STATEMENTS: readonly string[] = [
  `alter table clients add column kind text not null default 'phone'
    check (kind in ('phone', 'tablet', 'computer', 'browser'))`,
  `update clients set kind = 'computer' where platform = 'desktop'`,
  `update clients set kind = 'browser' where platform = 'web'`,
];
