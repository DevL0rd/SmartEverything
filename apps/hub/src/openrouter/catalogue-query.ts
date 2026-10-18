import {
  ApiError,
  latestGeminiFlash,
  type AiModelKind,
  type AiModelRow,
  type AiProviderCount,
} from '@smarteverything/domain';

export interface ModelFilter {
  readonly kind?: AiModelKind;
  readonly q?: string;
  readonly provider?: string;
  readonly gone: boolean;
}

export interface PageRequest {
  readonly cursor?: string;
  readonly limit: number;
}

export interface ModelPage {
  readonly models: AiModelRow[];
  readonly total: number;
  readonly next_cursor: string | null;
}

const CURSOR_SEPARATOR = '|';

interface Position {
  readonly created: string;
  readonly id: string;
}

function before(a: Position, b: Position): number {
  const byCreated = Date.parse(b.created) - Date.parse(a.created);
  return byCreated === 0 ? a.id.localeCompare(b.id) : byCreated;
}

export function newestFirst(a: AiModelRow, b: AiModelRow): number {
  return before(a, b);
}

function matches(row: AiModelRow, filter: ModelFilter): boolean {
  if (!filter.gone && row.gone_at !== null) {
    return false;
  }
  if (filter.kind !== undefined && !row.kinds.includes(filter.kind)) {
    return false;
  }
  if (filter.provider !== undefined && row.author !== filter.provider) {
    return false;
  }
  const words = (filter.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${row.name} ${row.author_name} ${row.id}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function cursorOf(row: AiModelRow): string {
  return `${row.created}${CURSOR_SEPARATOR}${row.id}`;
}

function positionOf(cursor: string): Position {
  const split = cursor.indexOf(CURSOR_SEPARATOR);
  const created = cursor.slice(0, split);
  const id = cursor.slice(split + 1);
  if (split < 1 || Number.isNaN(Date.parse(created)) || id === '') {
    throw new ApiError('invalid_request', 'That page cursor isn’t one this server gave out.');
  }
  return { created, id };
}

function startAfter(rows: readonly AiModelRow[], cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  const boundary = positionOf(cursor);
  const index = rows.findIndex((row) => before(boundary, row) < 0);
  return index === -1 ? rows.length : index;
}

export function pageOf(
  rows: readonly AiModelRow[],
  filter: ModelFilter,
  page: PageRequest,
): ModelPage {
  const matching = rows.filter((row) => matches(row, filter));
  const start = startAfter(matching, page.cursor);
  const models = matching.slice(start, start + page.limit);
  const last = models.at(-1);
  const more = start + page.limit < matching.length;
  return {
    models,
    total: matching.length,
    next_cursor: more && last !== undefined ? cursorOf(last) : null,
  };
}

function betterName(current: string, row: AiModelRow): string {
  const fromSlug = row.author.charAt(0).toUpperCase() + row.author.slice(1);
  return current === fromSlug ? row.author_name : current;
}

export function providersOf(
  rows: readonly AiModelRow[],
  kind: AiModelKind | undefined,
): AiProviderCount[] {
  const counts = new Map<string, AiProviderCount>();
  for (const row of rows) {
    if (row.gone_at === null && (kind === undefined || row.kinds.includes(kind))) {
      const known = counts.get(row.author);
      counts.set(row.author, {
        provider: row.author,
        name: known === undefined ? row.author_name : betterName(known.name, row),
        count: (known?.count ?? 0) + 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const VARIANT =
  /[:~]|-(lite|image|imagine|mini|nano|audio|tts|embed|guard|distill|vl|realtime|search|vision)\b/;

const FAMILIES: readonly RegExp[] = [
  /^google\/gemini-[\d.]+-pro(-preview)?$/,
  /^anthropic\/claude-(sonnet-[\d.]+|[\d.]+-sonnet)$/,
  /^anthropic\/claude-(opus-[\d.]+|[\d.]+-opus)$/,
  /^openai\/gpt-[\d.]+(-(?!pro$)[a-z]+)?$/,
  /^openai\/o\d+$/,
  /^deepseek\/deepseek-/,
  /^meta-llama\/llama-/,
  /^x-ai\/grok-/,
  /^mistralai\/mistral-/,
  /^qwen\/qwen/,
];

function newestOf(rows: readonly AiModelRow[], family: RegExp): AiModelRow | null {
  const candidates = rows.filter(
    (row) =>
      row.gone_at === null &&
      row.kinds.includes('chat') &&
      family.test(row.id) &&
      !VARIANT.test(row.id),
  );
  return [...candidates].sort(newestFirst)[0] ?? null;
}

export function topPicksOf(rows: readonly AiModelRow[]): AiModelRow[] {
  const picks = [latestGeminiFlash(rows), ...FAMILIES.map((family) => newestOf(rows, family))];
  return picks.filter((row): row is AiModelRow => row !== null);
}
