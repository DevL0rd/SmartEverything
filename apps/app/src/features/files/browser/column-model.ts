import type { FileAbilities } from '../source/abilities';
import type { FileNode, SortField, SourceActionSpec } from '../source/types';
import { menuOf, type MenuContext, type MenuSpec } from './menu-specs';
import { COLUMN_LABEL } from './sort-model';

export const TABLE_FROM = 600;

export type BrowserLayout = 'rows' | 'table';

export function layoutOf(width: number, compact: boolean): BrowserLayout {
  return !compact && width >= TABLE_FROM ? 'table' : 'rows';
}

export interface BrowserColumn {
  readonly field: SortField;
  readonly label: string;
  readonly sortable: boolean;
}

export function hasPeople(abilities: FileAbilities, nodes: readonly FileNode[]): boolean {
  return abilities.sort.includes('by') || nodes.some((node) => node.byProfileId !== null);
}

export function columnsOf(abilities: FileAbilities, people: boolean): readonly BrowserColumn[] {
  const fields: readonly SortField[] = people
    ? ['name', 'by', 'size', 'modifiedAt']
    : ['name', 'size', 'modifiedAt'];
  return fields.map((field) => ({
    field,
    label: COLUMN_LABEL[field],
    sortable: abilities.sort.includes(field),
  }));
}

const QUICK_IDS: ReadonlySet<string> = new Set(['star', 'unstar', 'download']);

export interface RowActions {
  readonly menu: readonly MenuSpec[];
  readonly quick: readonly MenuSpec[];
}

export function rowActionsOf<O>(
  node: FileNode<O>,
  context: MenuContext,
  sourceActions: readonly SourceActionSpec<O>[],
): RowActions {
  const menu = menuOf([node], context, sourceActions);
  return { menu, quick: menu.filter((spec) => QUICK_IDS.has(spec.id)) };
}

const BAR_SKIP: ReadonlySet<string> = new Set(['open', 'quickLook', 'details', 'rename']);

export interface BarActions {
  readonly actions: readonly MenuSpec[];
  readonly danger: readonly MenuSpec[];
}

export function selectionActionsOf<O>(
  nodes: readonly FileNode<O>[],
  context: MenuContext,
  sourceActions: readonly SourceActionSpec<O>[],
): BarActions {
  const specs = menuOf(nodes, context, sourceActions).filter((spec) => !BAR_SKIP.has(spec.id));
  return {
    actions: specs.filter((spec) => !spec.destructive),
    danger: specs.filter((spec) => spec.destructive),
  };
}
