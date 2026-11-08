import { MODEL_SPEC, type ModelSpec, type ModelSpecShot } from '@smarteverything/domain';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser } from 'playwright';
import { z } from 'zod';
import { PAGE } from './model-sheet-page';

export type SheetTheme = 'light' | 'dark';
export type SheetSignals = Readonly<Record<string, string | number | boolean>>;

export interface SheetOptions {
  readonly filters: readonly string[];
  readonly out: string;
  readonly frames: number;
  readonly dpr: number;
  readonly help: boolean;
}

export interface SheetCell {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly view: SheetView;
  readonly lod: (typeof SHEET_VIEWS)[SheetView]['lod'];
  readonly theme: SheetTheme;
  readonly signals: SheetSignals;
  readonly shot: string | null;
  readonly timeS: number;
  readonly caption: string;
}

export interface SheetLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly theme: SheetTheme;
  readonly strong: boolean;
}

export interface SheetPlan {
  readonly spec: ModelSpec;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly labels: readonly SheetLabel[];
  readonly cells: readonly SheetCell[];
}

export const SHEET_VIEWS = {
  tile: { w: 144, h: 96, lod: 0 },
  card: { w: 240, h: 150, lod: 1 },
  hero: { w: 280, h: 220, lod: 2 },
} as const;

export type SheetView = keyof typeof SHEET_VIEWS;

const VIEWS: readonly SheetView[] = ['tile', 'card', 'hero'];
const THEMES: readonly SheetTheme[] = ['light', 'dark'];
const GAP = 8;
const LABEL_W = 132;
const HEADER_H = 30;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = join(ROOT, 'apps/app/src/components/models');
const TASK_ID = /^[A-Z]{2,4}\d{1,3}[a-z]?$/;

export const USAGE = `Usage: pnpm exec tsx tooling/model-sheet.ts [filter ...] [--out dir] [--frames n] [--dpr n]

One contact sheet PNG per model in headless Google Chrome: light and dark, tile, card and hero,
every sample state of spec.states and a clip strip per shot and view. Run it in the chromium slot.
Filters (none = every model of packages/models/src/registry.ts):
  DM01, FC03, ...         specs exported from the owned folders of tmp/home-map/models-build/<task>.md
  dev.light.bulb-a60      one registry id;  dev.light.*  every registry id with that prefix
  path/to/specs.ts|.json  every valid ModelSpec exported from that file or folder
Options: --out dir (default tmp/model-sheets) · --frames n per strip (default 8) · --dpr n (default 2)
Prints per sheet: file, cells, ms (SLOW over 2 minutes) and the lowest mean silhouette edge contrast
against the stage surface (surface-2) per theme (LOW under 3:1, WCAG 1.4.11).`;

type Specs = readonly ModelSpec[];

const NUMBER_FLAG = z.coerce.number().positive();

function flagValue(argv: readonly string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

export function parseArgs(argv: readonly string[]): SheetOptions {
  const filters: string[] = [];
  let out = join(ROOT, 'tmp/model-sheets');
  let frames = 8;
  let dpr = 2;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--out') out = resolve(flagValue(argv, index++, arg));
    else if (arg === '--frames')
      frames = Math.round(NUMBER_FLAG.parse(flagValue(argv, index++, arg)));
    else if (arg === '--dpr') dpr = NUMBER_FLAG.parse(flagValue(argv, index++, arg));
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else filters.push(arg);
  }
  return { filters, out, frames: Math.max(1, frames), dpr, help };
}

export function matchesId(id: string, pattern: string): boolean {
  return pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern;
}

export function isTaskId(token: string): boolean {
  return TASK_ID.test(token);
}

export function taskFolders(brief: string): readonly string[] {
  const section = brief.split(/^## /m).find((part) => part.startsWith('Owned files'));
  if (section === undefined) return [];
  const folders = section
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => (line.slice(2).split(' ')[0] ?? '').replace(/\/\*+$/, ''))
    .filter((path) => path !== '' && !path.includes('/test/') && !path.startsWith('their'))
    .map((path) => (path.includes('*') ? dirname(path) : path));
  return [...new Set(folders)];
}

export function collectSpecs(values: readonly unknown[]): readonly ModelSpec[] {
  const found = new Map<string, ModelSpec>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const parsed = MODEL_SPEC.safeParse(value);
    if (parsed.success && !found.has(parsed.data.id)) found.set(parsed.data.id, parsed.data);
  };
  for (const value of values) visit(value);
  return [...found.values()];
}

export function sampleStates(spec: ModelSpec): readonly (readonly [string, SheetSignals])[] {
  const states = Object.entries(spec.states ?? {});
  return states.length > 0 ? states : [['rest', {}]];
}

type Leaf = ModelSpecShot['when']['anyOf'][number]['allOf'][number];

function leafValue(leaf: Leaf): string | number | boolean {
  const { op, value } = leaf;
  if (op === 'eq' || op === 'gte' || op === 'lte') return value;
  if (typeof value === 'boolean') return !value;
  if (typeof value !== 'number') return `${value}-other`;
  return op === 'lt' ? value - 1 : value + 1;
}

export function shotSignals(spec: ModelSpec, shot: ModelSpecShot): SheetSignals {
  const derived = (shot.when.anyOf[0]?.allOf ?? []).flatMap((leaf) =>
    typeof leaf.signal === 'string' ? [[leaf.signal, leafValue(leaf)] as const] : [],
  );
  const state = sampleStates(spec).find(([, signals]) =>
    derived.every(([key]) => signals[key] !== undefined),
  );
  return { ...(state?.[1] ?? {}), ...Object.fromEntries(derived) };
}

interface RowDraft {
  readonly label: string;
  readonly view: SheetView;
  readonly items: readonly Omit<SheetCell, 'x' | 'y' | 'w' | 'h' | 'view' | 'lod' | 'theme'>[];
}

type CellItem = RowDraft['items'][number];

function cellItem(
  signals: SheetSignals,
  shot: string | null,
  timeS: number,
  caption: string,
): CellItem {
  return { signals, shot, timeS, caption };
}

function rowDrafts(spec: ModelSpec, frames: number): readonly RowDraft[] {
  const states = VIEWS.map((view) => ({
    label: `${view} · states`,
    view,
    items: sampleStates(spec).map(([name, signals]) => cellItem(signals, null, 0, name)),
  }));
  const shots = (spec.shots ?? []).flatMap((shot) =>
    VIEWS.map((view) => ({
      label: `${view} · ${shot.id}`,
      view,
      items: Array.from({ length: frames }, (_, index) => {
        const timeS = (shot.loopS * index) / frames;
        return cellItem(shotSignals(spec, shot), shot.id, timeS, `${timeS.toFixed(2)} s`);
      }),
    })),
  );
  return [...states, ...shots];
}

function rowWidth(row: RowDraft): number {
  return LABEL_W + row.items.length * (SHEET_VIEWS[row.view].w + GAP);
}

export function planSheet(spec: ModelSpec, frames: number, dpr: number): SheetPlan {
  const rows = rowDrafts(spec, frames);
  const width = Math.max(...rows.map(rowWidth), LABEL_W + 3 * SHEET_VIEWS.hero.w) + GAP;
  const labels: SheetLabel[] = [];
  const cells: SheetCell[] = [];
  let y = 0;
  for (const theme of THEMES) {
    const text = `${spec.id} · ${spec.title} · ${theme}`;
    labels.push({ x: GAP, y: y + 20, text, theme, strong: true });
    y += HEADER_H;
    for (const row of rows) {
      const box = SHEET_VIEWS[row.view];
      labels.push({ x: GAP, y: y + 16, text: row.label, theme, strong: false });
      row.items.forEach((item, index) => {
        const x = LABEL_W + index * (box.w + GAP);
        cells.push({ ...item, x, y, w: box.w, h: box.h, view: row.view, lod: box.lod, theme });
      });
      y += box.h + GAP;
    }
  }
  return { spec, width, height: y, dpr, labels, cells };
}

async function importValues(file: string): Promise<readonly unknown[]> {
  const loaded: unknown = file.endsWith('.json')
    ? [JSON.parse(await readFile(file, 'utf8'))]
    : await import(pathToFileURL(file).href);
  if (typeof loaded !== 'object' || loaded === null) return [];
  const values: readonly unknown[] = Object.values(loaded);
  return values;
}

async function filesUnder(path: string): Promise<readonly string[]> {
  if (!existsSync(path)) return [];
  if ((await stat(path)).isFile()) return [path];
  const entries = await readdir(path, { recursive: true });
  return entries
    .filter((entry) => /\.(ts|json)$/.test(entry) && !entry.endsWith('.test.ts'))
    .map((entry) => join(path, entry));
}

async function specsFrom(path: string): Promise<Specs> {
  const values = await Promise.all((await filesUnder(path)).map(importValues));
  return collectSpecs(values.flat());
}

async function taskSpecs(task: string): Promise<Specs> {
  const brief = await readFile(join(ROOT, 'tmp/home-map/models-build', `${task}.md`), 'utf8');
  const found = await Promise.all(
    taskFolders(brief).map((folder) => specsFrom(join(ROOT, folder))),
  );
  return found.flat();
}

async function tokenSpecs(token: string, registry: Specs): Promise<Specs> {
  if (isTaskId(token)) return taskSpecs(token);
  const path = resolve(token);
  if (existsSync(path)) return specsFrom(path);
  return registry.filter((spec) => matchesId(spec.id, token));
}

export async function loadSpecs(filters: readonly string[]): Promise<Specs> {
  const registry = await specsFrom(join(ROOT, 'packages/models/src/registry.ts'));
  if (filters.length === 0) return registry;
  const found = await Promise.all(filters.map((token) => tokenSpecs(token, registry)));
  return collectSpecs(found.flat());
}

const PAGE_RESULT = z.object({
  png: z.string().startsWith('data:image/png;base64,'),
  light: z.number().nullable(),
  dark: z.number().nullable(),
});

async function bundlePage(): Promise<string> {
  const { build } = await import('esbuild');
  const result = await build({
    stdin: {
      contents: PAGE,
      resolveDir: MODELS_DIR,
      loader: 'ts',
      sourcefile: 'model-sheet-page.ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    logLevel: 'error',
  });
  const output = result.outputFiles[0];
  if (output === undefined) throw new Error('model sheet page bundle is empty');
  return output.text;
}

function contrastText(value: number | null): string {
  if (value === null) return 'n/a';
  return `${value.toFixed(2)}${value < 3 ? ' LOW' : ''}`;
}

async function renderOne(
  browser: Browser,
  script: string,
  spec: ModelSpec,
  options: SheetOptions,
): Promise<string> {
  const started = Date.now();
  const plan = planSheet(spec, options.frames, options.dpr);
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: script });
  const result = PAGE_RESULT.parse(await page.evaluate(`renderSheet(${JSON.stringify(plan)})`));
  await page.close();
  const file = join(options.out, `${spec.id}.png`);
  await writeFile(file, Buffer.from(result.png.slice(result.png.indexOf(',') + 1), 'base64'));
  const ms = Date.now() - started;
  const slow = ms > 120_000 ? ' SLOW' : '';
  const contrast = `light ${contrastText(result.light)} dark ${contrastText(result.dark)}`;
  return `${file} · ${String(plan.cells.length)} cells · ${String(ms)} ms${slow} · contrast ${contrast}\n`;
}

async function renderAll(specs: readonly ModelSpec[], options: SheetOptions): Promise<void> {
  const script = await bundlePage();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'chrome' });
  await mkdir(options.out, { recursive: true });
  try {
    for (const spec of specs) process.stdout.write(await renderOne(browser, script, spec, options));
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const specs = await loadSpecs(options.filters);
  if (specs.length === 0) {
    const asked = options.filters.join(' ') || 'the registry';
    process.stderr.write(`no models matched ${asked}\n\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  await renderAll(specs, options);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
