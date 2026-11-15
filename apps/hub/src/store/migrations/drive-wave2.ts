import type { Migration } from './migration';

const COUNT = (column: string): string => `check (${column} >= 0)`;

const JSON_ARRAY = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'array')`;

const SHA256 = (column: string): string =>
  `check (length(${column}) = 64 and ${column} not glob '*[^0-9a-f]*')`;

const ROLE = (column: string): string => `check (${column} in ('view', 'edit'))`;

const OPENS = [
  `create table drive_opens (
    profile_id text not null references profiles (id) on delete cascade,
    item_id text not null references drive_items (id) on delete cascade,
    opened_at text not null,
    primary key (profile_id, item_id)
  ) strict, without rowid`,
  'create index drive_opens_by_time on drive_opens (profile_id, opened_at desc)',
  'create index drive_opens_by_item on drive_opens (item_id)',
  `insert into drive_opens (profile_id, item_id, opened_at)
    select r.owner_profile_id, i.id, i.opened_at
    from drive_items i join drive_roots r on r.id = i.root_id
    where i.opened_at is not null and r.scope = 'person' and r.owner_profile_id is not null`,
  'drop index drive_items_by_opened',
  'alter table drive_items drop column opened_at',
];

const GRANT_EXPIRY = [
  'alter table drive_grants add column expires_at text',
  'create index drive_grants_by_expiry on drive_grants (expires_at) where expires_at is not null',
];

const SETTINGS = [
  `update ai_settings
    set settings = json_set(settings, '$.contentIndexing', json('true'), '$.ocrLanguages', json('["eng"]'))
    where key = 'drive'`,
];

const TEXT = [
  `create table drive_item_text (
    item_id text primary key references drive_items (id) on delete cascade,
    rev integer not null check (rev > 0),
    source text not null check (source in ('document', 'image')),
    state text not null check (state in ('ok', 'empty', 'failed', 'unsupported')),
    reason text check (reason is null or length(reason) > 0),
    chars integer not null ${COUNT('chars')},
    extracted_at text not null,
    check ((state in ('failed', 'unsupported')) = (reason is not null)),
    check ((state = 'ok') = (chars > 0))
  ) strict`,
  `create virtual table drive_item_text_search using fts5(
    item_id unindexed, body,
    tokenize = 'unicode61 remove_diacritics 2'
  )`,
  `create trigger drive_item_text_forgotten after delete on drive_item_text begin
    delete from drive_item_text_search where item_id = old.item_id;
  end`,
];

const FOLDER_ICONS = [
  `create table drive_folder_icons (
    folder_item_id text primary key references drive_items (id) on delete cascade,
    source text not null check (source in ('directory_file', 'desktop_ini', 'mac_icon', 'named_file')),
    source_rel_path text not null check (length(source_rel_path) > 0),
    source_rev integer not null check (source_rev > 0),
    image_sha256 text not null ${SHA256('image_sha256')},
    updated_at text not null
  ) strict`,
];

const COMMENTS = [
  `create table drive_comments (
    id text primary key,
    item_id text not null references drive_items (id) on delete cascade,
    author_profile_id text not null references profiles (id) on delete cascade,
    parent_id text references drive_comments (id) on delete cascade,
    body text check (body is null or length(trim(body)) > 0),
    mentions text not null ${JSON_ARRAY('mentions')},
    created_at text not null,
    edited_at text,
    resolved_at text,
    resolved_by text references profiles (id) on delete cascade,
    deleted_at text,
    check ((deleted_at is null) = (body is not null)),
    check ((resolved_at is null) = (resolved_by is null)),
    check (parent_id is null or resolved_at is null)
  ) strict`,
  'create index drive_comments_by_item on drive_comments (item_id, created_at, id)',
  'create index drive_comments_by_parent on drive_comments (parent_id) where parent_id is not null',
  'create index drive_comments_by_author on drive_comments (author_profile_id)',
];

const SHORTCUTS = [
  `create table drive_shortcuts (
    id text primary key,
    root_id text not null references drive_roots (id) on delete cascade,
    parent_item_id text references drive_items (id) on delete cascade,
    target_item_id text not null,
    name text not null check (length(trim(name)) > 0),
    created_by text not null references profiles (id) on delete cascade,
    created_at text not null
  ) strict`,
  `create unique index drive_shortcuts_by_name
    on drive_shortcuts (root_id, coalesce(parent_item_id, ''), name)`,
  'create index drive_shortcuts_by_parent on drive_shortcuts (parent_item_id) where parent_item_id is not null',
  'create index drive_shortcuts_by_target on drive_shortcuts (target_item_id)',
  'create index drive_shortcuts_by_creator on drive_shortcuts (created_by)',
];

const ACCESS_REQUESTS = [
  `create table drive_access_requests (
    id text primary key,
    item_id text not null references drive_items (id) on delete cascade,
    requester_profile_id text not null references profiles (id) on delete cascade,
    role text not null ${ROLE('role')},
    message text check (message is null or length(trim(message)) > 0),
    state text not null check (state in ('pending', 'approved', 'declined')),
    answered_by text references profiles (id) on delete cascade,
    answered_at text,
    expires_at text,
    created_at text not null,
    check ((state = 'pending') = (answered_at is null)),
    check ((answered_at is null) = (answered_by is null)),
    check (expires_at is null or state = 'approved')
  ) strict`,
  `create unique index drive_access_requests_pending
    on drive_access_requests (item_id, requester_profile_id) where state = 'pending'`,
  'create index drive_access_requests_by_requester on drive_access_requests (requester_profile_id, created_at desc)',
  'create index drive_access_requests_by_item on drive_access_requests (item_id)',
];

const FILE_REQUESTS = [
  `create table drive_file_requests (
    id text primary key,
    folder_item_id text not null references drive_items (id) on delete cascade,
    created_by text not null references profiles (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    message text check (message is null or length(trim(message)) > 0),
    token_hash text not null unique,
    expires_at text,
    closed_at text,
    uploads integer not null ${COUNT('uploads')},
    bytes integer not null ${COUNT('bytes')},
    created_at text not null
  ) strict`,
  'create index drive_file_requests_by_folder on drive_file_requests (folder_item_id)',
  'create index drive_file_requests_by_creator on drive_file_requests (created_by, created_at desc)',
  `create table drive_file_request_uploads (
    request_id text not null references drive_file_requests (id) on delete cascade,
    item_id text not null references drive_items (id) on delete cascade,
    uploader_name text not null check (length(trim(uploader_name)) > 0),
    uploaded_at text not null,
    primary key (request_id, item_id)
  ) strict, without rowid`,
  'create index drive_file_request_uploads_by_item on drive_file_request_uploads (item_id)',
];

const LOCKS = [
  `create table drive_item_locks (
    item_id text primary key references drive_items (id) on delete cascade,
    locked_by text references profiles (id) on delete set null,
    locked_at text not null
  ) strict`,
  'create index drive_item_locks_by_locker on drive_item_locks (locked_by) where locked_by is not null',
];

const NOTIFICATIONS = [
  `create table drive_notifications (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    kind text not null check (kind in ('shared', 'edited', 'commented', 'mentioned', 'replied',
      'access_requested', 'access_answered', 'file_request_upload', 'transfer_offered',
      'transfer_answered')),
    item_id text not null references drive_items (id) on delete cascade,
    actor_profile_id text references profiles (id) on delete cascade,
    actor_name text check (actor_name is null or length(trim(actor_name)) > 0),
    ref_id text check (ref_id is null or length(ref_id) > 0),
    count integer not null check (count > 0),
    created_at text not null,
    updated_at text not null,
    read_at text,
    check ((actor_profile_id is null) = (kind = 'file_request_upload')),
    check ((actor_name is not null) = (kind = 'file_request_upload')),
    check (kind <> 'file_request_upload' or ref_id is not null)
  ) strict`,
  `create unique index drive_notifications_unread
    on drive_notifications (profile_id, kind, item_id, coalesce(actor_profile_id, ''),
      coalesce(actor_name, ''), case when kind = 'file_request_upload' then ref_id else '' end)
    where read_at is null`,
  'create index drive_notifications_by_profile on drive_notifications (profile_id, updated_at desc, id)',
  'create index drive_notifications_by_item on drive_notifications (item_id)',
  'create index drive_notifications_by_actor on drive_notifications (actor_profile_id) where actor_profile_id is not null',
];

const TRANSFERS = [
  `create table drive_transfers (
    id text primary key,
    item_id text not null references drive_items (id) on delete cascade,
    from_profile_id text not null references profiles (id) on delete cascade,
    to_profile_id text not null references profiles (id) on delete cascade,
    state text not null check (state in ('offered', 'accepted', 'declined', 'cancelled')),
    created_at text not null,
    answered_at text,
    check ((state = 'offered') = (answered_at is null)),
    check (from_profile_id <> to_profile_id)
  ) strict`,
  "create unique index drive_transfers_open on drive_transfers (item_id) where state = 'offered'",
  'create index drive_transfers_by_sender on drive_transfers (from_profile_id, created_at desc)',
  'create index drive_transfers_by_recipient on drive_transfers (to_profile_id, created_at desc)',
];

const FOLDER_COLOURS = [
  `create table drive_folder_colours (
    profile_id text not null references profiles (id) on delete cascade,
    item_id text not null references drive_items (id) on delete cascade,
    colour text not null check (colour in ('viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5', 'viz-6', 'viz-7', 'viz-8')),
    primary key (profile_id, item_id)
  ) strict, without rowid`,
  'create index drive_folder_colours_by_item on drive_folder_colours (item_id)',
];

const OFFLINE = [
  `create table drive_offline_items (
    client_id text not null references clients (id) on delete cascade,
    item_id text not null references drive_items (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    state text not null check (state in ('waiting', 'ready', 'failed')),
    bytes integer not null ${COUNT('bytes')},
    synced_rev integer check (synced_rev is null or synced_rev > 0),
    error text check (error is null or length(error) > 0),
    updated_at text not null,
    primary key (client_id, item_id),
    check ((state = 'failed') = (error is not null)),
    check (state <> 'ready' or synced_rev is not null)
  ) strict, without rowid`,
  'create index drive_offline_items_by_item on drive_offline_items (item_id)',
  'create index drive_offline_items_by_profile on drive_offline_items (profile_id)',
];

export const DRIVE_WAVE2_MIGRATION: Migration = {
  version: 209,
  name: 'drive-wave2',
  statements: [
    ...OPENS,
    ...GRANT_EXPIRY,
    ...SETTINGS,
    ...TEXT,
    ...FOLDER_ICONS,
    ...COMMENTS,
    ...SHORTCUTS,
    ...ACCESS_REQUESTS,
    ...FILE_REQUESTS,
    ...LOCKS,
    ...NOTIFICATIONS,
    ...TRANSFERS,
    ...FOLDER_COLOURS,
    ...OFFLINE,
  ],
};
