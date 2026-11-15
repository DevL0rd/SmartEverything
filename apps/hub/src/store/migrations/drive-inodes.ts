import type { Migration } from './migration';

const COUNT = (column: string): string => `check (${column} >= 0)`;

const NS_OF = (moment: string): string =>
  `(cast(strftime('%s', ${moment}) as integer) * 1000000000
    + cast(round((strftime('%f', ${moment}) - cast(strftime('%S', ${moment}) as integer)) * 1000) as integer) * 1000000)`;

const NOW_NS = NS_OF("'now'");

const COPIED_COLUMNS = `rel_path, name, kind, mime, bytes, child_count, sha256,
  integrity, dev, ino, modified_at, added_at, rev, etag, outside, added_by_profile_id, remote_id,
  remote_rev, thumb_state, thumb_reason, taken_at, width, height, orientation, camera_make,
  camera_model, camera_lens, exposure_iso, exposure_aperture, exposure_shutter, exposure_focal,
  place_lat, place_lon, duration_ms`;

const FOLDER_MODE = 0o755;

const FILE_MODE = 0o644;

const NAMES_ONLY = "('folder', 'link', 'special')";

const INODES = [
  `create table drive_inodes (
    id integer primary key autoincrement,
    root_id text not null references drive_roots (id) on delete cascade,
    is_root integer not null check (is_root in (0, 1)),
    type text not null check (type in ('file', 'dir', 'symlink', 'fifo', 'socket', 'char', 'block')),
    mode integer not null check (mode between 0 and 4095),
    uid integer check (uid is null or uid between 0 and 4294967295),
    gid integer check (gid is null or gid between 0 and 4294967295),
    rdev integer check (rdev is null or rdev between 0 and 4294967295),
    link_target text check (link_target is null or length(cast(link_target as blob)) between 1 and 4095),
    atime_ns integer not null ${COUNT('atime_ns')},
    mtime_ns integer not null ${COUNT('mtime_ns')},
    ctime_ns integer not null ${COUNT('ctime_ns')},
    btime_ns integer not null ${COUNT('btime_ns')},
    orphan integer not null check (orphan in (0, 1)),
    check (is_root = 0 or (type = 'dir' and orphan = 0)),
    check ((rdev is not null) = (type in ('char', 'block'))),
    check ((link_target is not null) = (type = 'symlink'))
  ) strict`,
  'create unique index drive_inodes_root on drive_inodes (root_id) where is_root = 1',
  'create index drive_inodes_by_root on drive_inodes (root_id)',
  'create index drive_inodes_orphans on drive_inodes (root_id) where orphan = 1',
  `insert into drive_inodes (root_id, is_root, type, mode, uid, gid, rdev, link_target,
      atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
    select id, 1, 'dir', ${String(FOLDER_MODE)}, null, null, null, null,
      ${NOW_NS}, ${NOW_NS}, ${NOW_NS}, ${NOW_NS}, 0
    from drive_roots order by id`,
  `create table drive_inode_seed (
    item_id text primary key,
    inode_id integer not null
  ) strict, without rowid`,
  'create index drive_inode_seed_by_inode on drive_inode_seed (inode_id)',
  `insert into drive_inode_seed (item_id, inode_id)
    with named as (
      select id, kind, modified_at, added_at,
        case when kind <> 'folder' and dev is not null and ino is not null
          then root_id || char(0) || dev || char(0) || ino else id end as key
      from drive_items
    ), leaders as (
      select key, kind, modified_at, added_at,
        row_number() over (partition by key order by id) as place
      from named
    ), numbered as (
      select key, kind, modified_at, added_at,
        (select coalesce(max(id), 0) from drive_inodes) + row_number() over (order by key) as inode_id
      from leaders where place = 1
    ), members as (
      select named.id as item_id, numbered.inode_id
      from named join numbered on numbered.key = named.key
    )
    select item_id, inode_id from members`,
  `insert into drive_inodes (id, root_id, is_root, type, mode, uid, gid, rdev, link_target,
      atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
    select s.inode_id, i.root_id, 0,
      case when i.kind = 'folder' then 'dir' else 'file' end,
      case when i.kind = 'folder' then ${String(FOLDER_MODE)} else ${String(FILE_MODE)} end,
      null, null, null, null,
      ${NS_OF('i.modified_at')}, ${NS_OF('i.modified_at')}, ${NS_OF('i.modified_at')}, ${NS_OF('i.added_at')}, 0
    from drive_inode_seed s join drive_items i on i.id = s.item_id
    where s.item_id = (select min(m.item_id) from drive_inode_seed m where m.inode_id = s.inode_id)`,
];

const ATTRIBUTES = [
  `create table drive_xattrs (
    inode_id integer not null references drive_inodes (id) on delete cascade,
    name text not null check (length(cast(name as blob)) between 1 and 255),
    value blob not null check (length(value) <= 65536),
    primary key (inode_id, name)
  ) strict, without rowid`,
];

const COMMITS = [
  `create table drive_mount_commits (
    id integer primary key autoincrement,
    placement_id text not null references drive_placements (id) on delete cascade,
    node_id text not null references computer_nodes (device_id) on delete cascade,
    inode_id integer not null references drive_inodes (id) on delete cascade,
    op_key blob not null check (length(op_key) = 16),
    base_rev integer not null check (base_rev > 0),
    size integer ${COUNT('size')},
    ranges text not null check (json_valid(ranges) and json_type(ranges) = 'array'),
    state text not null check (state in ('open', 'done', 'aborted')),
    result_rev integer check (result_rev is null or result_rev > 0),
    created_at text not null,
    unique (placement_id, op_key),
    check ((state = 'done') = (result_rev is not null)),
    check ((state = 'done') = (size is not null))
  ) strict`,
  'create index drive_mount_commits_by_inode on drive_mount_commits (inode_id)',
  'create index drive_mount_commits_by_node on drive_mount_commits (node_id)',
  `create index drive_mount_commits_open on drive_mount_commits (placement_id, inode_id)
    where state = 'open'`,
];

const ITEMS = [
  `create table drive_items_next (
    id text primary key,
    root_id text not null references drive_roots (id) on delete cascade,
    parent_id text references drive_items (id) on delete cascade,
    inode_id integer not null references drive_inodes (id),
    rel_path text not null check (length(rel_path) > 0),
    name text not null check (length(name) > 0),
    kind text not null check (kind in ('folder', 'image', 'video', 'audio', 'document', 'other', 'link', 'special')),
    mime text check (mime is null or length(mime) > 0),
    bytes integer not null ${COUNT('bytes')},
    child_count integer ${COUNT('child_count')},
    sha256 text check (sha256 is null or (length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*')),
    integrity text not null check (integrity in ('unknown', 'ok', 'corrupt')),
    dev text,
    ino text,
    modified_at text not null,
    added_at text not null,
    rev integer not null check (rev > 0),
    etag text not null check (length(etag) > 0),
    outside integer not null check (outside in (0, 1)),
    added_by_profile_id text references profiles (id) on delete set null,
    remote_id text check (remote_id is null or length(remote_id) > 0),
    remote_rev text check (remote_rev is null or length(remote_rev) > 0),
    thumb_state text not null check (thumb_state in ('none', 'ready', 'failed', 'unsupported')),
    thumb_reason text check (thumb_reason is null or length(thumb_reason) > 0),
    taken_at text,
    width integer check (width is null or width > 0),
    height integer check (height is null or height > 0),
    orientation integer check (orientation is null or orientation between 1 and 8),
    camera_make text,
    camera_model text,
    camera_lens text,
    exposure_iso real check (exposure_iso is null or exposure_iso > 0),
    exposure_aperture real check (exposure_aperture is null or exposure_aperture > 0),
    exposure_shutter real check (exposure_shutter is null or exposure_shutter > 0),
    exposure_focal real check (exposure_focal is null or exposure_focal > 0),
    place_lat real check (place_lat is null or place_lat between -90 and 90),
    place_lon real check (place_lon is null or place_lon between -180 and 180),
    duration_ms integer check (duration_ms is null or duration_ms >= 0),
    unique (root_id, rel_path),
    check ((kind = 'folder') = (child_count is not null)),
    check (kind not in ${NAMES_ONLY} or (mime is null and sha256 is null and thumb_state = 'none')),
    check (kind in ${NAMES_ONLY} or mime is not null),
    check (kind in ('image', 'video') or (width is null and height is null and orientation is null and camera_make is null and camera_model is null and camera_lens is null and exposure_iso is null and exposure_aperture is null and exposure_shutter is null and exposure_focal is null and place_lat is null and place_lon is null)),
    check (kind in ('image', 'video', 'audio') or taken_at is null),
    check (kind in ('video', 'audio') or duration_ms is null),
    check ((thumb_state in ('failed', 'unsupported')) = (thumb_reason is not null)),
    check ((place_lat is null) = (place_lon is null))
  ) strict`,
  `insert into drive_items_next (id, root_id, parent_id, inode_id, ${COPIED_COLUMNS})
    select i.id, i.root_id, i.parent_id, s.inode_id, ${COPIED_COLUMNS.split(',')
      .map((column) => `i.${column.trim()}`)
      .join(', ')}
    from drive_items i join drive_inode_seed s on s.item_id = i.id`,
  'drop table drive_items',
  'alter table drive_items_next rename to drive_items',
  'create index drive_items_by_parent on drive_items (root_id, parent_id, name)',
  'create index drive_items_by_parent_kind on drive_items (parent_id, kind)',
  'create index drive_items_by_inode on drive_items (inode_id)',
  'create index drive_items_by_adder on drive_items (added_by_profile_id)',
  `create index drive_items_by_taken on drive_items (taken_at desc)
    where kind in ('image', 'video', 'audio')`,
  'create index drive_items_by_sha256 on drive_items (sha256) where sha256 is not null',
  'create index drive_items_by_added on drive_items (added_at desc)',
];

const STASHED_NS = (moment: string): string => NS_OF(`json_extract(t.row, '${moment}')`);

const TRASH = [
  `create table drive_inode_trash_seed (
    trash_item_id text not null,
    seq integer not null,
    base integer not null,
    inode_id integer not null,
    primary key (trash_item_id, seq)
  ) strict, without rowid`,
  `insert into drive_inode_trash_seed (trash_item_id, seq, base, inode_id)
    select t.trash_item_id, t.seq,
      (select max(m.seq) + 1 from drive_trash_rows m where m.trash_item_id = t.trash_item_id),
      (select coalesce(max(id), 0) from drive_inodes)
        + row_number() over (order by t.trash_item_id, t.seq)
    from drive_trash_rows t where t.table_name = 'drive_items'`,
  `insert into drive_inodes (id, root_id, is_root, type, mode, uid, gid, rdev, link_target,
      atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
    select s.inode_id, json_extract(t.row, '$.root_id'), 0,
      case when json_extract(t.row, '$.kind') = 'folder' then 'dir' else 'file' end,
      case when json_extract(t.row, '$.kind') = 'folder' then ${String(FOLDER_MODE)} else ${String(FILE_MODE)} end,
      null, null, null, null,
      ${STASHED_NS('$.modified_at')}, ${STASHED_NS('$.modified_at')}, ${STASHED_NS('$.modified_at')},
      ${STASHED_NS('$.added_at')}, 1
    from drive_inode_trash_seed s
    join drive_trash_rows t on t.trash_item_id = s.trash_item_id and t.seq = s.seq`,
  `insert into drive_trash_rows (trash_item_id, seq, table_name, row)
    select s.trash_item_id, s.base + s.seq, 'drive_inodes',
      json_object('id', n.id, 'root_id', n.root_id, 'is_root', n.is_root, 'type', n.type,
        'mode', n.mode, 'uid', n.uid, 'gid', n.gid, 'rdev', n.rdev, 'link_target', n.link_target,
        'atime_ns', cast(n.atime_ns as text), 'mtime_ns', cast(n.mtime_ns as text),
        'ctime_ns', cast(n.ctime_ns as text), 'btime_ns', cast(n.btime_ns as text),
        'orphan', 0)
    from drive_inode_trash_seed s join drive_inodes n on n.id = s.inode_id`,
  `update drive_trash_rows
    set row = json_set(drive_trash_rows.row, '$.inode_id', s.inode_id)
    from drive_inode_trash_seed s
    where drive_trash_rows.trash_item_id = s.trash_item_id and drive_trash_rows.seq = s.seq`,
  'delete from drive_inodes where orphan = 1',
  'drop table drive_inode_trash_seed',
  'drop table drive_inode_seed',
];

const LIFECYCLE = [
  `create trigger drive_items_release_inode after delete on drive_items
    when not exists (select 1 from drive_items n where n.inode_id = old.inode_id)
    begin
      delete from drive_inodes where id = old.inode_id and is_root = 0 and orphan = 0;
    end`,
  `create trigger drive_roots_root_inode after insert on drive_roots begin
    insert into drive_inodes (root_id, is_root, type, mode, uid, gid, rdev, link_target,
        atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
      values (new.id, 1, 'dir', ${String(FOLDER_MODE)}, null, null, null, null,
        ${NOW_NS}, ${NOW_NS}, ${NOW_NS}, ${NOW_NS}, 0);
  end`,
];

export const DRIVE_INODES_MIGRATION: Migration = {
  version: 215,
  name: 'drive-inodes',
  foreignKeys: 'off',
  statements: [...INODES, ...ATTRIBUTES, ...COMMITS, ...ITEMS, ...TRASH, ...LIFECYCLE],
};
