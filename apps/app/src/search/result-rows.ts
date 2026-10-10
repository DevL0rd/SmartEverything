import type { ResultBranch, ResultNode } from './nodes';

export interface Expansion {
  readonly open: ReadonlySet<string>;
  readonly closed: ReadonlySet<string>;
  readonly all: ReadonlySet<string>;
}

export const NO_EXPANSION: Expansion = { open: new Set(), closed: new Set(), all: new Set() };

const ROOT_CAP = 5;

const CHILD_CAP = 3;

export type RowEdge = 'only' | 'first' | 'middle' | 'last';

interface Placed {
  readonly key: string;
  readonly depth: number;
  readonly edge: RowEdge;
}

export type SearchRow =
  | {
      readonly kind: 'group';
      readonly key: string;
      readonly label: string;
      readonly clear: boolean;
    }
  | (Placed & {
      readonly kind: 'node';
      readonly node: ResultNode;
      readonly parent: string | null;
      readonly expandable: boolean;
      readonly expanded: boolean;
    })
  | (Placed & { readonly kind: 'more'; readonly target: string; readonly total: number })
  | (Placed & { readonly kind: 'query'; readonly text: string; readonly icon: 'clock' | 'search' });

type Unplace<Row> = Row extends Placed ? Omit<Row, 'edge'> : Row;

type Unplaced = Unplace<SearchRow>;

function expandedOf(node: ResultNode, depth: number, expansion: Expansion): boolean {
  if (node.children.length === 0 || expansion.closed.has(node.key)) {
    return false;
  }
  return expansion.open.has(node.key) || depth === 0 || node.found;
}

function capped<T>(
  items: readonly T[],
  key: string,
  cap: number,
  expansion: Expansion,
): readonly T[] {
  return expansion.all.has(key) ? items : items.slice(0, cap);
}

function pushNode(
  out: Unplaced[],
  node: ResultNode,
  place: { readonly depth: number; readonly parent: string | null },
  expansion: Expansion,
): void {
  const expanded = expandedOf(node, place.depth, expansion);
  out.push({
    kind: 'node',
    key: node.key,
    node,
    ...place,
    expandable: node.children.length > 0,
    expanded,
  });
  if (!expanded) {
    return;
  }
  const shown = capped(node.children, node.key, CHILD_CAP, expansion);
  for (const child of shown) {
    pushNode(out, child, { depth: place.depth + 1, parent: node.key }, expansion);
  }
  if (shown.length < node.children.length) {
    const total = node.children.length;
    out.push({
      kind: 'more',
      key: `more:${node.key}`,
      target: node.key,
      total,
      depth: place.depth + 1,
    });
  }
}

function edgeOf(rows: readonly Unplaced[], index: number): RowEdge {
  const before = rows[index - 1];
  const first = before === undefined || before.kind === 'group';
  const after = rows[index + 1];
  const last = after === undefined || after.kind === 'group';
  if (first) {
    return last ? 'only' : 'first';
  }
  return last ? 'last' : 'middle';
}

function placed(rows: readonly Unplaced[]): readonly SearchRow[] {
  return rows.map((row, index) =>
    row.kind === 'group' ? row : { ...row, edge: edgeOf(rows, index) },
  );
}

function groupRow(key: string, label: string, clear = false): Unplaced {
  return { kind: 'group', key: `group:${key}`, label, clear };
}

export function treeRows(
  branches: readonly ResultBranch[],
  expansion: Expansion,
): readonly SearchRow[] {
  const out: Unplaced[] = [];
  for (const branch of branches) {
    out.push(groupRow(branch.group, branch.label));
    const target = `group:${branch.group}`;
    const shown = capped(branch.roots, target, ROOT_CAP, expansion);
    for (const root of shown) {
      pushNode(out, root, { depth: 0, parent: null }, expansion);
    }
    if (shown.length < branch.roots.length) {
      out.push({
        kind: 'more',
        key: `more:${target}`,
        target,
        total: branch.roots.length,
        depth: 1,
      });
    }
  }
  return placed(out);
}

interface Suggestions {
  readonly recent: readonly string[];
  readonly favourites: readonly ResultNode[];
  readonly rooms: readonly ResultNode[];
  readonly tries: readonly string[];
}

function queryRows(
  queries: readonly string[],
  icon: 'clock' | 'search',
  prefix: string,
): Unplaced[] {
  return queries.map((text) => ({ kind: 'query', key: `${prefix}:${text}`, text, icon, depth: 0 }));
}

function nodeRows(nodes: readonly ResultNode[]): Unplaced[] {
  return nodes.map((node) => ({
    kind: 'node',
    key: node.key,
    node,
    depth: 0,
    parent: null,
    expandable: false,
    expanded: false,
  }));
}

export function suggestionRows(suggestions: Suggestions): readonly SearchRow[] {
  const sections: readonly (readonly Unplaced[])[] = [
    suggestions.recent.length === 0
      ? []
      : [
          groupRow('recent', 'Recent searches', true),
          ...queryRows(suggestions.recent, 'clock', 'recent'),
        ],
    suggestions.favourites.length === 0
      ? []
      : [groupRow('favourites', 'Favourites'), ...nodeRows(suggestions.favourites)],
    suggestions.rooms.length === 0
      ? []
      : [groupRow('rooms', 'Rooms'), ...nodeRows(suggestions.rooms)],
    suggestions.tries.length === 0
      ? []
      : [groupRow('tries', 'Try'), ...queryRows(suggestions.tries, 'search', 'try')],
  ];
  return placed(sections.flat());
}
