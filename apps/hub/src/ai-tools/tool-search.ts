import {
  API_ENDPOINTS,
  MCP_ROUTES,
  MCP_UNAVAILABLE_OPERATIONS,
  isHumanOnlyOperation,
  isMcpToolName,
  mcpOperationArea,
  mcpToolOperation,
  partsOf,
  type EndpointName,
  type McpToolArea,
} from '@smarteverything/domain';

export interface SearchableTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
}

export interface SearchedOperation {
  readonly operation: string;
  readonly summary: string;
  readonly area: McpToolArea;
  readonly call: 'operation_call';
}

const WEIGHT = { name: 8, title: 5, description: 2, parts: 1 } as const;
const OPERATION_WEIGHT = { name: 6, summary: 2 } as const;
const SYNONYM_FACTOR = 0.5;
const PREFIX_FACTOR = 0.6;
const PREFIX_MIN = 4;
const STEM_MIN = 4;
const CUTOFF = 0.25;

const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'on',
  'off',
  'of',
  'to',
  'in',
  'at',
  'my',
  'me',
  'for',
  'and',
  'or',
  'is',
  'it',
  'with',
  'please',
  'can',
  'you',
]);

const VERB_ALIAS_WORDS: Readonly<Record<string, readonly string[]>> = {
  turn: ['control', 'power'],
  switch: ['control', 'power'],
  toggle: ['control', 'power'],
  dim: ['control', 'brightness'],
  create: ['edit'],
  add: ['edit'],
  make: ['edit'],
};

const SYNONYM_WORDS: Readonly<Record<string, readonly string[]>> = {
  light: ['device'],
  lamp: ['device'],
  bulb: ['device'],
  fan: ['device'],
  heater: ['device'],
  thermostat: ['device'],
  timer: ['schedule', 'later', 'delay'],
  alarm: ['schedule', 'later'],
  countdown: ['schedule', 'later'],
  remind: ['schedule', 'notify'],
  reminder: ['schedule', 'notify'],
  breakfast: ['food', 'meal'],
  lunch: ['food', 'meal'],
  dinner: ['food', 'meal'],
  eat: ['food', 'meal'],
  drink: ['water', 'food'],
  sleep: ['health'],
  step: ['health'],
  weight: ['health', 'body'],
  wifi: ['settings', 'router'],
};

function stemOf(word: string): string {
  if (word.length < STEM_MIN) {
    return word;
  }
  const folded = word
    .replace(/ies$/u, 'y')
    .replace(/(ss|x|z|ch|sh)es$/u, '$1')
    .replace(/([^s])s$/u, '$1')
    .replace(/(.{3,})(ing|ed)$/u, '$1');
  return folded.length >= STEM_MIN ? folded.replace(/e$/u, '') : folded;
}

function stemmed(
  table: Readonly<Record<string, readonly string[]>>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    Object.entries(table).map(([word, related]) => [stemOf(word), related.map(stemOf)]),
  );
}

const VERB_ALIASES = stemmed(VERB_ALIAS_WORDS);
const SYNONYMS = stemmed(SYNONYM_WORDS);

function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');
}

function stemsOf(text: string): string[] {
  return wordsOf(text).map(stemOf);
}

function termsOf(query: string): string[] {
  return [...new Set(wordsOf(query).filter((word) => !STOP_WORDS.has(word)))];
}

function closeness(term: string, field: string): number {
  if (term === field) {
    return 1;
  }
  const [short, long] = term.length <= field.length ? [term, field] : [field, term];
  return short.length >= PREFIX_MIN && long.startsWith(short) ? PREFIX_FACTOR : 0;
}

function bestIn(term: string, fields: readonly string[]): number {
  return fields.reduce((best, field) => Math.max(best, closeness(term, field)), 0);
}

interface Weighted {
  readonly weight: number;
  readonly stems: readonly string[];
}

function termScore(word: string, fields: readonly Weighted[], aliased: boolean): number {
  const own = stemOf(word);
  const alias = aliased ? (VERB_ALIASES.get(own) ?? []) : [];
  const related = SYNONYMS.get(own) ?? [];
  const nearest = (terms: readonly string[], stems: readonly string[]): number =>
    terms.reduce((top, term) => Math.max(top, bestIn(term, stems)), 0);
  return fields.reduce((best, { weight, stems }) => {
    const exact = Math.max(bestIn(own, stems), nearest(alias, stems));
    return Math.max(best, weight * Math.max(exact, nearest(related, stems) * SYNONYM_FACTOR));
  }, 0);
}

function scored(terms: readonly string[], fields: readonly Weighted[], aliased: boolean): number {
  return terms.reduce((sum, word) => sum + termScore(word, fields, aliased), 0);
}

function partSummary(part: string): string {
  const operation = mcpToolOperation(part);
  return operation === undefined ? '' : API_ENDPOINTS[operation].summary;
}

function partsText(name: string): string {
  const route = isMcpToolName(name) ? MCP_ROUTES.get(name) : undefined;
  if (route === undefined) {
    return '';
  }
  const branches =
    'branches' in route
      ? Object.entries(route.branches).map(([value, branch]) => `${value} ${branch.line}`)
      : [];
  return [...branches, ...partsOf(route).map(partSummary)].join(' ');
}

function toolFields(tool: SearchableTool): Weighted[] {
  return [
    { weight: WEIGHT.name, stems: stemsOf(tool.name) },
    { weight: WEIGHT.title, stems: stemsOf(tool.title ?? '') },
    { weight: WEIGHT.description, stems: stemsOf(tool.description) },
    { weight: WEIGHT.parts, stems: stemsOf(partsText(tool.name)) },
  ];
}

function ranked<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  score: (item: T) => number,
): T[] {
  const hits = items
    .map((item) => ({ item, name: nameOf(item), score: score(item) }))
    .filter((hit) => hit.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        wordsOf(a.name).length - wordsOf(b.name).length ||
        a.name.localeCompare(b.name),
    );
  const best = hits[0]?.score ?? 0;
  return hits.filter((hit) => hit.score >= best * CUTOFF).map((hit) => hit.item);
}

export function rankTools<T extends SearchableTool>(tools: readonly T[], query: string): T[] {
  const terms = termsOf(query);
  return ranked(
    tools,
    (tool) => tool.name,
    (tool) => scored(terms, toolFields(tool), true),
  );
}

const DEDICATED_OPERATIONS: ReadonlySet<string> = new Set(
  [...MCP_ROUTES.values()]
    .flatMap(partsOf)
    .map(mcpToolOperation)
    .filter((operation): operation is EndpointName => operation !== undefined),
);

function isEndpointName(name: string): name is EndpointName {
  return Object.hasOwn(API_ENDPOINTS, name);
}

const REACHED_BY_CALL: readonly SearchedOperation[] = Object.keys(API_ENDPOINTS)
  .filter(isEndpointName)
  .filter(
    (name) =>
      !isHumanOnlyOperation(name) &&
      MCP_UNAVAILABLE_OPERATIONS[name] === undefined &&
      !DEDICATED_OPERATIONS.has(name),
  )
  .map((name) => ({
    operation: name,
    summary: API_ENDPOINTS[name].summary,
    area: mcpOperationArea(API_ENDPOINTS[name]),
    call: 'operation_call',
  }));

export function rankOperations(
  query: string,
  inScope: (area: McpToolArea) => boolean,
): SearchedOperation[] {
  const terms = termsOf(query);
  return ranked(
    REACHED_BY_CALL.filter((entry) => inScope(entry.area)),
    (entry) => entry.operation,
    (entry) =>
      scored(
        terms,
        [
          { weight: OPERATION_WEIGHT.name, stems: stemsOf(entry.operation) },
          { weight: OPERATION_WEIGHT.summary, stems: stemsOf(entry.summary) },
        ],
        false,
      ),
  );
}
