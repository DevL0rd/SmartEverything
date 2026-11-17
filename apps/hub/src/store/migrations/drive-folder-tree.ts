import type { Migration } from './migration';

const BYTES_OF = (row: string): string =>
  `case when ${row}.kind = 'folder' then ${row}.tree_bytes
    when ${row}.kind in ('link', 'special') then 0 else ${row}.bytes end`;

const FILES_OF = (row: string): string =>
  `case when ${row}.kind = 'folder' then ${row}.tree_files else 1 end`;

const CHAIN = (start: string): string => `(with recursive chain(id) as (
    select ${start}
    union all
    select up.parent_id from drive_items up join chain on up.id = chain.id
      where up.parent_id is not null
  ) select id from chain)`;

const ADD = (row: string): string =>
  `update drive_items set tree_bytes = tree_bytes + ${BYTES_OF(row)},
    tree_files = tree_files + ${FILES_OF(row)}
    where id in ${CHAIN(`${row}.parent_id`)};`;

const SUBTRACT = (row: string): string =>
  `update drive_items set tree_bytes = tree_bytes - ${BYTES_OF(row)},
    tree_files = tree_files - ${FILES_OF(row)}
    where id in ${CHAIN(`${row}.parent_id`)};`;

export const DRIVE_FOLDER_TREE_BACKFILL = `with recursive up(ancestor, bytes) as (
    select parent_id, case when kind in ('link', 'special') then 0 else bytes end
      from drive_items where kind <> 'folder' and parent_id is not null
    union all
    select p.parent_id, up.bytes from up join drive_items p on p.id = up.ancestor
      where p.parent_id is not null
  ), sums as (select ancestor, sum(bytes) as bytes, count(*) as files from up group by ancestor)
  update drive_items set tree_bytes = sums.bytes, tree_files = sums.files
    from sums where drive_items.id = sums.ancestor`;

const ROOT_BYTES_OF = (row: string): string =>
  `case when ${row}.kind in ('folder', 'link', 'special') then 0 else ${row}.bytes end`;

const ROOT_TOTALS = (row: string, sign: '+' | '-'): string =>
  `update drive_roots set items = items ${sign} (${row}.kind <> 'folder'),
    folders = folders ${sign} (${row}.kind = 'folder'),
    bytes = bytes ${sign} ${ROOT_BYTES_OF(row)}
    where id = ${row}.root_id;`;

export const DRIVE_ROOT_TOTALS_BACKFILL = [
  'update drive_roots set items = 0, folders = 0, bytes = 0',
  `with sums as (select root_id, sum(kind <> 'folder') as items, sum(kind = 'folder') as folders,
      sum(${ROOT_BYTES_OF('drive_items')}) as bytes from drive_items group by root_id)
    update drive_roots set items = sums.items, folders = sums.folders, bytes = sums.bytes
      from sums where drive_roots.id = sums.root_id`,
] as const;

export const DRIVE_FOLDER_TREE_MIGRATION: Migration = {
  version: 233,
  name: 'drive-folder-tree',
  statements: [
    'alter table drive_items add column tree_bytes integer not null default 0 check (tree_bytes >= 0)',
    'alter table drive_items add column tree_files integer not null default 0 check (tree_files >= 0)',
    DRIVE_FOLDER_TREE_BACKFILL,
    ...DRIVE_ROOT_TOTALS_BACKFILL,
    `create trigger drive_items_root_insert after insert on drive_items
      begin ${ROOT_TOTALS('new', '+')} end`,
    `create trigger drive_items_root_delete after delete on drive_items
      begin ${ROOT_TOTALS('old', '-')} end`,
    `create trigger drive_items_root_update after update of root_id, kind, bytes on drive_items
      when old.root_id is not new.root_id or old.kind is not new.kind
        or ${ROOT_BYTES_OF('old')} <> ${ROOT_BYTES_OF('new')}
      begin ${ROOT_TOTALS('old', '-')} ${ROOT_TOTALS('new', '+')} end`,
    `create trigger drive_items_tree_insert after insert on drive_items
      when new.parent_id is not null begin ${ADD('new')} end`,
    `create trigger drive_items_tree_delete after delete on drive_items
      when old.parent_id is not null begin ${SUBTRACT('old')} end`,
    `create trigger drive_items_tree_move_out after update of parent_id, kind, bytes on drive_items
      when old.parent_id is not null and (old.parent_id is not new.parent_id
        or ${BYTES_OF('old')} <> ${BYTES_OF('new')} or ${FILES_OF('old')} <> ${FILES_OF('new')})
      begin ${SUBTRACT('old')} end`,
    `create trigger drive_items_tree_move_in after update of parent_id, kind, bytes on drive_items
      when new.parent_id is not null and (old.parent_id is not new.parent_id
        or ${BYTES_OF('old')} <> ${BYTES_OF('new')} or ${FILES_OF('old')} <> ${FILES_OF('new')})
      begin ${ADD('new')} end`,
  ],
};
