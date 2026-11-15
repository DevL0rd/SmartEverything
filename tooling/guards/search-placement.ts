import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface SourceFile {
  readonly file: string;
  readonly path: string;
  readonly text: string;
}

const SLOT_FOLDER = 'src/components/page-shell/';

const SLOT_FILES: ReadonlySet<string> = new Set([
  'src/components/search-field.tsx',
  'src/components/flow-frame.tsx',
]);

const OVERLAY_ROOTS: ReadonlySet<string> = new Set([
  'Sheet',
  'BottomSheet',
  'DialogFrame',
  'Popover',
  'PopoverFrame',
  'AdaptivePanel',
  'Overlay',
  'OverlayPane',
  'PullUpPanel',
  'HostedSheetPages',
  'ToastModal',
  'SheetBody',
  'Modal',
]);

const OVERLAY_NAME = /(?:Sheet|Dialog|Popover|Overlay|Modal)$/u;

const SEARCH_TAGS = ['SearchField', 'ShellSearch', 'ShellSearchField'] as const;

const SEARCH_INPUT =
  /<TextInput\b[^;]*?(?:(?:accessibilityRole|role)=["{']+search|returnKeyType=["{']+search|inputMode=["{']+search)/u;

const NAMED_IMPORT = /import\s+(?!type\b)\{([^}]*)\}\s+from\s+'(\.[^']+)'/gu;

const RE_EXPORT = /export\s+(?!type\b)(\*|\{[^}]*\})\s+from\s+'(\.[^']+)'/gu;

const DECLARATION =
  /^(export\s+)?(?:default\s+)?(?:function\s+([A-Za-z_]\w*)|const\s+([A-Za-z_]\w*)\s*[:=])/gmu;

const OPEN_TAG = /<([A-Z]\w*)/gu;

const QUOTES = new Set(['"', "'", '`']);

function added<K, T>(groups: Map<K, T[]>, key: K, item: T): void {
  const group = groups.get(key);
  if (group === undefined) groups.set(key, [item]);
  else group.push(item);
}

function reExported(list: string, name: string): boolean {
  return list === '*' || namesOf(list.slice(1, -1)).some(([, local]) => local === name);
}

function resolved(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  const candidates = [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function namesOf(list: string): readonly (readonly [string, string])[] {
  return list
    .split(',')
    .map((part) => part.trim().replace(/^type\s+/u, ''))
    .filter((part) => /^[A-Za-z_]/u.test(part))
    .map((part) => {
      const [name = part, local = name] = part.split(/\s+as\s+/u);
      return [name, local] as const;
    });
}

export function rendersSearch(source: SourceFile): boolean {
  if (source.path.startsWith(SLOT_FOLDER) || SLOT_FILES.has(source.path)) return false;
  return searchTagsOf(source.text).length > 0;
}

function searchTagsOf(text: string): readonly string[] {
  const tags: string[] = SEARCH_TAGS.filter((tag) => new RegExp(`<${tag}\\b`, 'u').test(text));
  return SEARCH_INPUT.test(text) ? [...tags, 'TextInput'] : tags;
}

function tagEnd(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let at = open + 1; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (QUOTES.has(char) && depth === 0) {
      quote = char;
    } else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return at;
  }
  throw new Error(`A tag that opens at ${String(open)} never closes.`);
}

function spanOf(text: string, open: number, name: string): readonly [number, number] {
  const end = tagEnd(text, open);
  if (text.charAt(end - 1) === '/') return [open, end];
  const pattern = new RegExp(`<${name}\\b|</${name}>`, 'gu');
  pattern.lastIndex = end;
  let depth = 1;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match[0].startsWith('</')) depth -= 1;
    else if (text.charAt(tagEnd(text, match.index) - 1) !== '/') depth += 1;
    if (depth === 0) return [open, match.index];
  }
  throw new Error(`The <${name}> that opens at ${String(open)} has no closing tag.`);
}

function overlaySpans(
  text: string,
  overlay: (name: string) => boolean,
): readonly (readonly [number, number])[] {
  return [...text.matchAll(OPEN_TAG)]
    .filter((match) => overlay(match[1] ?? ''))
    .map((match) => spanOf(text, match.index, match[1] ?? ''));
}

interface Unit {
  readonly start: number;
  readonly name: string;
  readonly exported: boolean;
}

function unitsOf(text: string): readonly Unit[] {
  return [...text.matchAll(DECLARATION)].map((match) => ({
    start: match.index,
    name: match[2] ?? match[3] ?? '',
    exported: match[1] !== undefined,
  }));
}

function occurrencesOf(text: string, name: string): readonly number[] {
  return [...text.matchAll(new RegExp(`<${name}\\b`, 'gu'))].map((match) => match.index);
}

function importRanges(text: string): readonly (readonly [number, number])[] {
  return [...text.matchAll(/^(?:import|export)\s[^;]*?from\s+'[^']+';/gmu)].map(
    (match) => [match.index, match.index + match[0].length] as const,
  );
}

function referencesOf(text: string, name: string): readonly number[] {
  const imports = importRanges(text);
  return [...text.matchAll(new RegExp(`(?<![\\w.<])${name}\\b`, 'gu'))]
    .map((match) => match.index)
    .filter((at) => !imports.some(([open, close]) => open <= at && at < close))
    .filter((at) => !/(?:function|const|interface|type)\s+$/u.test(text.slice(at - 12, at)));
}

function usesOf(text: string, name: string): readonly number[] {
  const tags = occurrencesOf(text, name);
  return tags.length > 0 ? tags : referencesOf(text, name);
}

function isOverlayTag(name: string): boolean {
  return OVERLAY_ROOTS.has(name) || OVERLAY_NAME.test(name);
}

function returnedOf(body: string): readonly string[] {
  const returns = [...body.matchAll(/\breturn\b\s*\(?\s*(null|<[A-Z]\w*|[^\s(])/gu)];
  const arrow = /^[^{]*?=>\s*\(?\s*(<[A-Z]\w*)/u.exec(body);
  const found = returns.map((match) => match[1] ?? '');
  return found.length === 0 && arrow?.[1] !== undefined ? [arrow[1]] : found;
}

interface User {
  readonly file: string;
  readonly local: string;
}

class Placement {
  private readonly text: ReadonlyMap<string, string>;
  private readonly users = new Map<string, User[]>();
  private readonly imported = new Map<string, Map<string, readonly [string, string]>>();
  private readonly spans = new Map<string, readonly (readonly [number, number])[]>();
  private readonly units = new Map<string, readonly Unit[]>();
  private readonly overlays = new Map<string, boolean>();

  constructor(
    files: readonly SourceFile[],
    private readonly routes: ReadonlySet<string>,
  ) {
    this.text = new Map(files.map((source) => [source.file, source.text]));
    for (const source of files) this.index(source);
  }

  private index(source: SourceFile): void {
    for (const match of source.text.matchAll(NAMED_IMPORT)) {
      const target = match[2] === undefined ? null : resolved(source.file, match[2]);
      if (target === null) continue;
      for (const [name, local] of namesOf(match[1] ?? '')) {
        const origin = this.origin(target, name, new Set());
        const key = `${origin}#${name}`;
        const own = this.imported.get(source.file) ?? new Map<string, readonly [string, string]>();
        own.set(local, [origin, name]);
        this.imported.set(source.file, own);
        added(this.users, key, { file: source.file, local });
      }
    }
  }

  private defines(file: string, name: string): boolean {
    return this.unitsIn(file).some((unit) => unit.exported && unit.name === name);
  }

  private origin(file: string, name: string, seen: ReadonlySet<string>): string {
    const text = this.text.get(file);
    if (text === undefined || seen.has(file) || this.defines(file, name)) return file;
    for (const [, list = '', spec = ''] of text.matchAll(RE_EXPORT)) {
      const target = resolved(file, spec);
      if (target === null || !reExported(list, name)) continue;
      const found = this.origin(target, name, new Set([...seen, file]));
      if (this.defines(found, name)) return found;
    }
    return file;
  }

  private unitsIn(file: string): readonly Unit[] {
    const known = this.units.get(file);
    if (known !== undefined) return known;
    const units = unitsOf(this.text.get(file) ?? '');
    this.units.set(file, units);
    return units;
  }

  private spansIn(file: string): readonly (readonly [number, number])[] {
    const known = this.spans.get(file);
    if (known !== undefined) return known;
    const spans = overlaySpans(this.text.get(file) ?? '', (name) => this.overlayTag(file, name));
    this.spans.set(file, spans);
    return spans;
  }

  coveredAt(file: string, at: number, seen: ReadonlySet<string>): boolean {
    if (this.spansIn(file).some(([open, close]) => open < at && at < close)) return true;
    const unit = this.unitsIn(file).findLast((candidate) => candidate.start < at);
    if (unit === undefined) return false;
    if (this.overlayUnit(file, unit)) return true;
    return unit.exported
      ? this.coveredUpstream(file, unit.name, seen)
      : this.covered(file, unit.name, seen);
  }

  private overlayTag(file: string, tag: string): boolean {
    if (isOverlayTag(tag)) return true;
    const from = this.imported.get(file)?.get(tag);
    if (from === undefined) return false;
    const unit = this.unitsIn(from[0]).find((one) => one.exported && one.name === from[1]);
    return unit !== undefined && this.overlayUnit(from[0], unit);
  }

  private overlayUnit(file: string, unit: Unit): boolean {
    const key = `${file}#${unit.name}`;
    const known = this.overlays.get(key);
    if (known !== undefined) return known;
    this.overlays.set(key, false);
    const units = this.unitsIn(file);
    const next = units.find((candidate) => candidate.start > unit.start);
    const body = (this.text.get(file) ?? '').slice(unit.start, next?.start);
    const returned = returnedOf(body).filter((value) => value !== 'null');
    const overlay =
      returned.length > 0 &&
      returned.every((value) => {
        if (!value.startsWith('<')) return false;
        const tag = value.slice(1);
        const local = units.find((candidate) => candidate.name === tag);
        return local === undefined ? this.overlayTag(file, tag) : this.overlayUnit(file, local);
      });
    this.overlays.set(key, overlay);
    return overlay;
  }

  private covered(file: string, name: string, seen: ReadonlySet<string>): boolean {
    const key = `${file}#${name}`;
    if (seen.has(key)) return true;
    const next = new Set([...seen, key]);
    const uses = usesOf(this.text.get(file) ?? '', name);
    const exported = this.unitsIn(file).some((unit) => unit.exported && unit.name === name);
    const upstream = exported ? this.upstreamOf(file, name) : [];
    if (this.routes.has(file) && exported) return false;
    if (uses.length === 0 && upstream.length === 0) return false;
    return (
      uses.every((index) => this.coveredAt(file, index, next)) &&
      upstream.every((user) => this.covered(user.file, user.local, next))
    );
  }

  private upstreamOf(file: string, name: string): readonly User[] {
    return this.users.get(`${file}#${name}`) ?? [];
  }

  private coveredUpstream(file: string, name: string, seen: ReadonlySet<string>): boolean {
    if (this.routes.has(file)) return false;
    const users = this.upstreamOf(file, name);
    return users.length > 0 && users.every((user) => this.covered(user.file, user.local, seen));
  }
}

export function searchesOutsideTheShell(
  sources: readonly SourceFile[],
  routes: readonly SourceFile[],
): readonly string[] {
  const placement = new Placement([...sources, ...routes], new Set(routes.map((r) => r.file)));
  return sources
    .filter(rendersSearch)
    .filter((source) =>
      searchTagsOf(source.text).some((tag) =>
        occurrencesOf(source.text, tag).some(
          (at) => !placement.coveredAt(source.file, at, new Set()),
        ),
      ),
    )
    .map((source) => source.path);
}

const VALUE_IMPORT = /(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?'(\.[^']+)'/gu;

function importersOf(files: readonly SourceFile[]): ReadonlyMap<string, readonly string[]> {
  const importers = new Map<string, string[]>();
  for (const source of files) {
    for (const match of source.text.matchAll(VALUE_IMPORT)) {
      const target = match[1] === undefined ? null : resolved(source.file, match[1]);
      if (target !== null) added(importers, target, source.file);
    }
  }
  return importers;
}

export function routesReaching(
  sources: readonly SourceFile[],
  routes: readonly SourceFile[],
  path: string,
): readonly string[] {
  const importers = importersOf([...sources, ...routes]);
  const routeFiles = new Map(routes.map((route) => [route.file, route.path]));
  const start = sources.find((source) => source.path === path);
  const queue = start === undefined ? [] : [start.file];
  const seen = new Set<string>();
  const reached = new Set<string>();
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const route = routeFiles.get(file);
    if (route !== undefined) reached.add(route);
    queue.push(...(importers.get(file) ?? []));
  }
  return [...reached].sort();
}
