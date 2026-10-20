import {
  NODE_CATEGORIES,
  SHIPPED_TIERS,
  type AutomationFunctionSummary,
  type NodeAccess,
  type NodeCategoryId,
  type NodeKind,
} from '@smarteverything/domain';
import { compareText } from '../../../format/text';

export interface CatalogEntry {
  readonly key: string;
  readonly source: 'node' | 'function';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: NodeCategoryId;
  readonly keywords: readonly string[];
  readonly access: NodeAccess;
}

export interface CatalogGroup {
  readonly id: NodeCategoryId;
  readonly name: string;
  readonly entries: readonly CatalogEntry[];
}

const FUNCTION_ICON = 'function';

function nodeEntry(kind: NodeKind): CatalogEntry {
  return {
    key: `node:${kind.id}`,
    source: 'node',
    id: kind.id,
    name: kind.name,
    description: kind.description,
    icon: kind.icon,
    category: kind.category,
    keywords: kind.keywords,
    access: kind.access,
  };
}

function functionEntry(fn: AutomationFunctionSummary): CatalogEntry {
  return {
    key: `function:${fn.id}`,
    source: 'function',
    id: fn.id,
    name: fn.name,
    description: fn.description ?? '',
    icon: fn.icon ?? FUNCTION_ICON,
    category: 'reusable',
    keywords: fn.category === null ? [] : [fn.category],
    access: 'member',
  };
}

export function catalogOf(
  kinds: readonly NodeKind[],
  functions: readonly AutomationFunctionSummary[],
): readonly CatalogGroup[] {
  const entries = [
    ...kinds.filter((kind) => SHIPPED_TIERS.includes(kind.tier)).map(nodeEntry),
    ...functions.map(functionEntry),
  ];
  return NODE_CATEGORIES.map(({ id, name }) => ({
    id,
    name,
    entries: entries
      .filter((entry) => entry.category === id)
      .sort((left, right) => compareText(left.name, right.name)),
  })).filter((group) => group.entries.length > 0);
}

function matches(entry: CatalogEntry, words: readonly string[]): boolean {
  const haystack = [entry.name, entry.description, ...entry.keywords].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function searchCatalog(
  groups: readonly CatalogGroup[],
  query: string,
): readonly CatalogEntry[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  const all = groups.flatMap((group) => group.entries);
  if (words.length === 0) return all;
  return all.filter((entry) => matches(entry, words));
}
