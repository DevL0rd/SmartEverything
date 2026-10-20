import { IDENT_PATTERN, isReservedWord } from '../automation-v3/ident';
import { NODE_KIND_ID, SCOPE_NAME, TRIGGER_KIND_PREFIX } from '../automation-v3/node';
import { typeDisplayName } from '../automation-v3/type-rules';
import type { NodeCategoryId } from './categories';
import { NODE_CATEGORY_IDS, categoryName, categoryOrder } from './categories';
import type { NodeAccess, NodeClass, NodeKind, NodeTier } from './define';
import { SHIPPED_TIERS } from './define';
import { summaryProblems } from './summary-template';

export interface KindProblem {
  readonly id: string;
  readonly message: string;
}

function duplicates(names: readonly string[]): readonly string[] {
  return names.filter((name, index) => names.indexOf(name) !== index);
}

function portNameProblems(kind: NodeKind): readonly string[] {
  const problems: string[] = [];
  for (const port of [...kind.inputs, ...kind.outputs]) {
    if (!IDENT_PATTERN.test(port.name) || isReservedWord(port.name)) {
      problems.push(`port name "${port.name}" is not a valid identifier`);
    }
    if (port.description.trim() === '') problems.push(`port "${port.name}" has no description`);
  }
  return problems;
}

function portProblems(kind: NodeKind): readonly string[] {
  const problems: string[] = [...portNameProblems(kind)];
  for (const name of duplicates(kind.inputs.map((port) => port.name))) {
    problems.push(`input port "${name}" is declared twice`);
  }
  for (const name of duplicates(kind.outputs.map((port) => port.name))) {
    problems.push(`output port "${name}" is declared twice`);
  }
  for (const port of kind.inputs) {
    if (port.required && port.default !== undefined) {
      problems.push(`input "${port.name}" is required and also has a default`);
    }
    if (port.static === true && port.live === true) {
      problems.push(`input "${port.name}" cannot be both static and live`);
    }
  }
  return problems;
}

function nameListProblems(label: string, names: readonly string[]): readonly string[] {
  return [
    ...names
      .filter((name) => !SCOPE_NAME.safeParse(name).success)
      .map((name) => `${label} "${name}" is not an identifier`),
    ...duplicates(names).map((name) => `${label} "${name}" is listed twice`),
  ];
}

function shapeProblems(kind: NodeKind): readonly string[] {
  const scopes = kind.scopes;
  const problems: string[] = [
    ...nameListProblems('exit', kind.exits),
    ...(scopes === undefined
      ? []
      : nameListProblems('scope', [...scopes.required, ...scopes.optional])),
  ];
  const quiet = kind.class === 'pure' || kind.class === 'read' || kind.class === 'trigger';
  if (quiet && kind.exits.length > 0) problems.push(`a ${kind.class} kind has no exec exits`);
  if (quiet && scopes !== undefined) problems.push(`a ${kind.class} kind has no child scopes`);
  return problems;
}

function classProblems(kind: NodeKind): readonly string[] {
  const problems: string[] = [];
  const isTriggerId = kind.id.startsWith(TRIGGER_KIND_PREFIX);
  if (isTriggerId !== (kind.class === 'trigger')) {
    problems.push(`only trigger kinds use the ${TRIGGER_KIND_PREFIX} prefix`);
  }
  if (kind.class === 'effect' && kind.effect === undefined) {
    problems.push('an effect kind declares its retry class and budget class');
  }
  if (kind.class !== 'effect' && kind.effect !== undefined) {
    problems.push(`a ${kind.class} kind has no effect class`);
  }
  if (kind.stateful === true && kind.class !== 'effect' && kind.class !== 'control') {
    problems.push(`a ${kind.class} kind cannot be stateful`);
  }
  return problems;
}

export function kindProblems(kind: NodeKind): readonly string[] {
  const problems: string[] = [];
  if (!NODE_KIND_ID.safeParse(kind.id).success)
    problems.push('the id is not dotted lowercase words');
  if (kind.name.trim() === '') problems.push('the name is empty');
  if (kind.icon.trim() === '') problems.push('the icon is empty');
  if (kind.description.trim() === '') problems.push('the description is empty');
  if (!NODE_CATEGORY_IDS.includes(kind.category))
    problems.push(`unknown category "${kind.category}"`);
  if (kind.keywords.some((word) => word.trim() === '')) problems.push('a keyword is empty');
  problems.push(
    ...portProblems(kind),
    ...shapeProblems(kind),
    ...classProblems(kind),
    ...summaryProblems(
      kind.summary,
      kind.inputs.map((port) => port.name),
    ),
  );
  return problems;
}

export function registryProblems(kinds: readonly NodeKind[]): readonly KindProblem[] {
  const problems: KindProblem[] = [];
  for (const id of new Set(duplicates(kinds.map((kind) => kind.id)))) {
    problems.push({ id, message: 'the id is used by more than one kind' });
  }
  for (const kind of kinds) {
    for (const message of kindProblems(kind)) problems.push({ id: kind.id, message });
  }
  return problems;
}

export interface NodeRegistry {
  readonly kinds: readonly NodeKind[];
  readonly get: (id: string) => NodeKind | undefined;
  readonly has: (id: string) => boolean;
  readonly shipped: () => readonly NodeKind[];
}

export function buildRegistry(kinds: readonly NodeKind[]): NodeRegistry {
  const problems = registryProblems(kinds);
  if (problems.length > 0) {
    throw new Error(
      `invalid node registry: ${problems.map((problem) => `${problem.id}: ${problem.message}`).join('; ')}`,
    );
  }
  const byId = new Map(kinds.map((kind) => [kind.id, kind]));
  return {
    kinds,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    shipped: () => kinds.filter((kind) => SHIPPED_TIERS.includes(kind.tier)),
  };
}

export interface NodeCatalogueFilter {
  readonly query?: string;
  readonly group?: NodeCategoryId;
  readonly kind?: string;
  readonly caller?: NodeAccess;
  readonly includeUnshipped?: boolean;
}

export interface NodeCataloguePort {
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly optional?: boolean;
  readonly default?: unknown;
  readonly static?: boolean;
  readonly live?: boolean;
  readonly description: string;
}

export interface NodeCatalogueEntry {
  readonly id: string;
  readonly name: string;
  readonly group: NodeCategoryId;
  readonly groupName: string;
  readonly class: NodeClass;
  readonly meaning: string;
  readonly summary: string;
  readonly inputs: readonly NodeCataloguePort[];
  readonly outputs: readonly NodeCataloguePort[];
  readonly exits: readonly string[];
  readonly scopes: readonly string[];
  readonly effect?: { readonly retry: string; readonly budget: string };
  readonly access: NodeAccess;
  readonly available: boolean;
  readonly tier: NodeTier;
}

function matchesQuery(kind: NodeKind, query: string): boolean {
  const haystack = [
    kind.id,
    kind.name,
    kind.description,
    kind.summary,
    categoryName(kind.category),
    ...kind.keywords,
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => haystack.includes(word));
}

function project(kind: NodeKind, caller: NodeAccess): NodeCatalogueEntry {
  const base = {
    id: kind.id,
    name: kind.name,
    group: kind.category,
    groupName: categoryName(kind.category),
    class: kind.class,
    meaning: kind.description,
    summary: kind.summary,
    inputs: kind.inputs.map((port) => ({
      name: port.name,
      type: typeDisplayName(port.type),
      required: port.required,
      ...(port.default === undefined ? {} : { default: port.default }),
      ...(port.static === true ? { static: true } : {}),
      ...(port.live === true ? { live: true } : {}),
      description: port.description,
    })),
    outputs: kind.outputs.map((port) => ({
      name: port.name,
      type: typeDisplayName(port.type),
      ...(port.optional === true ? { optional: true } : {}),
      description: port.description,
    })),
    exits: kind.exits,
    scopes: kind.scopes === undefined ? [] : [...kind.scopes.required, ...kind.scopes.optional],
    access: kind.access,
    available: kind.access === 'member' || caller === 'owner',
    tier: kind.tier,
  };
  return kind.effect === undefined
    ? base
    : { ...base, effect: { retry: kind.effect.retry, budget: kind.effect.budget } };
}

export function nodeCatalogue(
  registry: NodeRegistry,
  filter: NodeCatalogueFilter = {},
): readonly NodeCatalogueEntry[] {
  const caller = filter.caller ?? 'member';
  const pool = filter.includeUnshipped === true ? registry.kinds : registry.shipped();
  return [...pool]
    .filter((kind) => filter.kind === undefined || kind.id === filter.kind)
    .filter((kind) => filter.group === undefined || kind.category === filter.group)
    .filter((kind) => filter.query === undefined || matchesQuery(kind, filter.query))
    .sort(
      (a, b) => categoryOrder(a.category) - categoryOrder(b.category) || a.id.localeCompare(b.id),
    )
    .map((kind) => project(kind, caller));
}
