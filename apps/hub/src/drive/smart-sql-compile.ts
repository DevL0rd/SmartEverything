import type { SmartRule, SmartRuleLeaf } from '@smarteverything/domain';
import { allOf, inList, type SqlFilter } from '../store/sql';
import { starredBy } from '../store/repositories/drive-stars';
import { accessSql } from './access';
import { dayBounds } from './smart-sql-dates';

export interface SmartScope {
  readonly reachProfileId: string | null;
  readonly starViewerId: string | null;
  readonly timeZone: string;
}

type Leaf<K extends SmartRuleLeaf['kind']> = Extract<SmartRuleLeaf, { kind: K }>;

const TEXT_COLUMNS: Readonly<Record<Leaf<'text'>['field'], string>> = {
  name: 'name',
  path: 'rel_path',
  camera: "trim(coalesce(camera_make, '') || ' ' || coalesce(camera_model, ''))",
  lens: "coalesce(camera_lens, '')",
};

const DATE_COLUMNS: Readonly<Record<Leaf<'date_range'>['field'], string>> = {
  takenAt: 'taken_at',
  addedAt: 'added_at',
  modifiedAt: 'modified_at',
};

class Parameters {
  private count = 0;

  next(): string {
    const name = `rule${String(this.count)}`;
    this.count += 1;
    return name;
  }
}

function single(name: string, text: string, value: string | number): SqlFilter {
  return { text, parameters: { [name]: value } };
}

function itemKinds(leaf: Leaf<'item_kind'>, names: Parameters): SqlFilter {
  return inList('kind', names.next(), leaf.itemKinds);
}

function textContains(leaf: Leaf<'text'>, names: Parameters): SqlFilter {
  const name = names.next();
  return single(
    name,
    `instr(lower(${TEXT_COLUMNS[leaf.field]}), lower($${name})) > 0`,
    leaf.contains,
  );
}

interface Bounds {
  readonly column: string;
  readonly low: number | null;
  readonly high: number | null;
  readonly lowOperator: '>=';
  readonly highOperator: '<' | '<=';
}

function bounded(bounds: Bounds, names: Parameters): SqlFilter {
  const clauses: SqlFilter[] = [];
  if (bounds.low !== null) {
    const name = names.next();
    clauses.push(single(name, `${bounds.column} ${bounds.lowOperator} $${name}`, bounds.low));
  }
  if (bounds.high !== null) {
    const name = names.next();
    clauses.push(single(name, `${bounds.column} ${bounds.highOperator} $${name}`, bounds.high));
  }
  return clauses.length === 0
    ? { text: `${bounds.column} is not null`, parameters: {} }
    : allOf(clauses);
}

function dateRange(leaf: Leaf<'date_range'>, scope: SmartScope, names: Parameters): SqlFilter {
  const days = dayBounds({ from: leaf.from, to: leaf.to }, scope.timeZone);
  return bounded(
    {
      column: `unixepoch(${DATE_COLUMNS[leaf.field]})`,
      low: days.startSeconds,
      high: days.endSeconds,
      lowOperator: '>=',
      highOperator: '<',
    },
    names,
  );
}

function inFolder(leaf: Leaf<'in_folder'>, names: Parameters): SqlFilter {
  const name = names.next();
  return single(
    name,
    `exists (select 1 from drive_items folder
      where folder.id = $${name} and folder.kind = 'folder'
        and folder.root_id = drive_items.root_id
        and substr(drive_items.rel_path, 1, length(folder.rel_path) + 1) = folder.rel_path || '/')`,
    leaf.folderId,
  );
}

function starredLeaf(leaf: Leaf<'starred'>, scope: SmartScope, names: Parameters): SqlFilter {
  if (scope.starViewerId === null) {
    return { text: leaf.starred ? '0' : '1', parameters: {} };
  }
  const name = names.next();
  const starred = starredBy(`$${name}`, 'drive_items.id');
  return single(name, leaf.starred ? starred : `not ${starred}`, scope.starViewerId);
}

function compileLeaf(leaf: SmartRuleLeaf, scope: SmartScope, names: Parameters): SqlFilter {
  switch (leaf.kind) {
    case 'item_kind':
      return itemKinds(leaf, names);
    case 'text':
      return textContains(leaf, names);
    case 'date_range':
      return dateRange(leaf, scope, names);
    case 'in_root': {
      const name = names.next();
      return single(name, `root_id = $${name}`, leaf.rootId);
    }
    case 'in_folder':
      return inFolder(leaf, names);
    case 'starred':
      return starredLeaf(leaf, scope, names);
    case 'size_range':
      return bounded(
        {
          column: 'bytes',
          low: leaf.minBytes,
          high: leaf.maxBytes,
          lowOperator: '>=',
          highOperator: '<=',
        },
        names,
      );
    case 'duration_range':
      return bounded(
        {
          column: 'duration_ms',
          low: leaf.minMs,
          high: leaf.maxMs,
          lowOperator: '>=',
          highOperator: '<=',
        },
        names,
      );
  }
}

function joined(filters: readonly SqlFilter[], word: 'and' | 'or'): SqlFilter {
  return {
    text: `(${filters.map((filter) => `(${filter.text})`).join(` ${word} `)})`,
    parameters: Object.fromEntries(filters.flatMap((filter) => Object.entries(filter.parameters))),
  };
}

function reachable(names: Parameters, scope: SmartScope): SqlFilter {
  if (scope.reachProfileId === null) {
    return { text: "root_id in (select id from drive_roots where scope = 'home')", parameters: {} };
  }
  const name = names.next();
  return single(
    name,
    `exists (select 1 from drive_roots r where r.id = drive_items.root_id
      and ${accessSql('drive_items', 'r').replaceAll('$profile', `$${name}`)})`,
    scope.reachProfileId,
  );
}

export function compileSmartRule(rule: SmartRule, scope: SmartScope): SqlFilter {
  const names = new Parameters();
  const leaves = rule.rules.map((leaf) => compileLeaf(leaf, scope, names));
  return allOf([
    { text: "kind <> 'folder'", parameters: {} },
    reachable(names, scope),
    joined(leaves, rule.match === 'all' ? 'and' : 'or'),
  ]);
}

export const SMART_ORDER_KEY = 'unixepoch(coalesce(taken_at, modified_at))';
