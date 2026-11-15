import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { isMissing } from '../errors.ts';
import { median } from './summary.ts';
import { summarizeProfile } from './profile.ts';

const RESULT = z.looseObject({
  workload: z.string(),
  kind: z.string(),
  run: z.number(),
  seconds: z.number(),
  closeSeconds: z.number(),
  bytes: z.number(),
  ops: z.number(),
  threads: z.number(),
  errors: z.number().optional(),
  stalledPending: z.number().optional(),
});
const LOAD = z.looseObject({
  kind: z.string(),
  run: z.number(),
  workload: z.string(),
  hostBusyPercent: z.number(),
  load1Start: z.number(),
  clientCpuSeconds: z.number(),
  serverCpuSeconds: z.number(),
  serverThreadSeconds: z.record(z.string(), z.number()).optional(),
});
const FAILURE = z.looseObject({ kind: z.string(), run: z.number(), workload: z.string() });
const OP = z.object({
  count: z.number(),
  totalMs: z.number(),
  p50Ms: z.number(),
  p95Ms: z.number(),
  p99Ms: z.number(),
  maxMs: z.number(),
});
const HELPER = z.object({ ops: z.record(z.string(), OP) });
const HUB = z.object({
  ops: z.record(z.string(), z.object({ wait: OP.partial(), run: OP.partial() })),
  cpuUserMs: z.number(),
  cpuSystemMs: z.number(),
  eventLoopUtilization: z.number(),
  eventLoopDelayMs: z.object({ p50: z.number(), p99: z.number(), max: z.number() }),
});

type Result = z.infer<typeof RESULT>;
type Load = z.infer<typeof LOAD>;

const CHANGING = new Set([
  'seq-write',
  'rand-write-1',
  'rand-write-16',
  'create-1',
  'create-16',
  'create-32',
  'untar',
  'clone',
  'office-save',
  'rm-tree',
]);

function timeOf(result: Result): number {
  return CHANGING.has(result.workload) ? result.seconds : result.closeSeconds;
}

function lines<S extends z.ZodType>(text: string, schema: S): z.output<S>[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => schema.parse(JSON.parse(line)));
}

export function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = 0.95 * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return (sorted[low] ?? 0) + ((sorted[high] ?? 0) - (sorted[low] ?? 0)) * (position - low);
}

function fixed(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function notes(runs: readonly Result[]): string {
  const retries = runs.reduce((sum, run) => sum + (run.errors ?? 0), 0);
  const stalled = runs.filter((run) => (run.stalledPending ?? 0) > 0).length;
  return [
    retries > 0 ? `${String(retries)} EIO retries` : '',
    stalled > 0 ? `${String(stalled)} runs ended with uploads stuck` : '',
  ]
    .filter((note) => note !== '')
    .join('; ');
}

function rate(name: string, runs: readonly Result[]): string {
  const first = runs[0];
  if (first === undefined) return '-';
  const seconds = median(runs.map(timeOf));
  if (name.startsWith('seq-')) return `${fixed(first.bytes / 1048576 / seconds, 1)} MB/s`;
  return `${fixed(first.ops / seconds, 1)} ops/s`;
}

export async function localReport(prefix: string): Promise<string> {
  const results = lines(await readFile(`${prefix}.jsonl`, 'utf8'), RESULT);
  const loads = lines(await readFile(`${prefix}.load.jsonl`, 'utf8'), LOAD);
  const failures = lines(await readFile(`${prefix}.failures.jsonl`, 'utf8'), FAILURE);
  const workloads = [...new Set([...results, ...failures].map((item) => item.workload))];
  const kinds = [...new Set([...results, ...failures].map((item) => item.kind))];
  const order = ['nfs', ...kinds.filter((kind) => kind !== 'nfs')];
  const out: string[] = [];
  for (const workload of workloads) {
    out.push(`### ${workload}`, '');
    out.push(
      '| kind | ok runs | failed runs | median s | p95 s | spread | rate | ratio to nfs | host busy % | load1 at start | client CPU s | server CPU s | notes |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    );
    const base = median(
      results.filter((r) => r.workload === workload && r.kind === 'nfs').map(timeOf),
    );
    for (const kind of order) {
      const runs = results.filter((r) => r.workload === workload && r.kind === kind);
      const failed = failures.filter((f) => f.workload === workload && f.kind === kind).length;
      if (runs.length === 0 && failed === 0) continue;
      if (runs.length === 0) {
        out.push(`| ${kind} | 0 | ${String(failed)} | failed | | | | | | | | | |`);
        continue;
      }
      const seconds = runs.map(timeOf);
      const mid = median(seconds);
      const spread = mid === 0 ? 0 : ((Math.max(...seconds) - Math.min(...seconds)) / mid) * 100;
      const own: Load[] = loads.filter((l) => l.workload === workload && l.kind === kind);
      const avg = (pick: (load: Load) => number): string =>
        own.length === 0 ? '-' : fixed(median(own.map(pick)), 1);
      const ratio = kind === 'nfs' || base === 0 ? '-' : fixed(mid / base, 2);
      out.push(
        `| ${kind} | ${String(runs.length)} | ${String(failed)} | ${fixed(mid)} | ${fixed(percentile95(seconds))} | ${fixed(spread, 0)}% | ${rate(workload, runs)} | ${ratio} | ${avg((l) => l.hostBusyPercent)} | ${avg((l) => l.load1Start)} | ${avg((l) => l.clientCpuSeconds)} | ${avg((l) => l.serverCpuSeconds)} | ${notes(runs)} |`,
      );
    }
    out.push('');
  }
  out.push(...(await breakdown(`${prefix}.prof`, loads)));
  return out.join('\n');
}

interface Segment {
  readonly label: string;
  readonly hub: z.infer<typeof HUB>;
  readonly helper: z.infer<typeof HELPER>;
  readonly profile: ReturnType<typeof summarizeProfile>;
  readonly load: Load | undefined;
}

async function readSegment(
  directory: string,
  label: string,
  loads: readonly Load[],
): Promise<Segment> {
  const text = (name: string): Promise<string> =>
    readFile(join(directory, `${label}.${name}`), 'utf8');
  return {
    label,
    hub: HUB.parse(JSON.parse(await text('hub.json'))),
    helper: HELPER.parse(JSON.parse(await text('helper.json'))),
    profile: summarizeProfile(await text('hub.cpuprofile'), 6),
    load: loads.find((load) => `${load.kind}.run${String(load.run)}.${load.workload}` === label),
  };
}

function summaryLines(segment: Segment): string[] {
  const { hub, profile, load } = segment;
  const threads = Object.entries(load?.serverThreadSeconds ?? {}).sort(
    (left, right) => right[1] - left[1],
  );
  const categories = Object.entries(profile.byCategory)
    .filter(([, ms]) => ms >= 1)
    .map(([name, ms]) => `${name} ${fixed(ms, 0)}`)
    .join(', ');
  const lines = [
    `Hub: CPU ${fixed((hub.cpuUserMs + hub.cpuSystemMs) / 1000, 2)} s (user ${fixed(hub.cpuUserMs / 1000, 2)}, system ${fixed(hub.cpuSystemMs / 1000, 2)}), event loop utilization ${fixed(hub.eventLoopUtilization * 100, 0)}%, event loop delay p50 ${fixed(hub.eventLoopDelayMs.p50, 2)} ms, p99 ${fixed(hub.eventLoopDelayMs.p99, 1)} ms, max ${fixed(hub.eventLoopDelayMs.max, 0)} ms.`,
    '',
    `Hub main thread by category (ms, busy ${fixed(profile.busyMs, 0)} of ${fixed(profile.totalMs, 0)}): ${categories}.`,
    '',
    `Hub top functions: ${profile.top.map((entry) => `${entry.name} ${fixed(entry.ms, 0)} ms`).join('; ')}.`,
    '',
  ];
  if (load === undefined) return lines;
  return [
    `Process CPU: helper ${fixed(load.clientCpuSeconds, 2)} s, Hub ${fixed(load.serverCpuSeconds, 2)} s; Hub threads: ${threads.map(([name, seconds]) => `${name} ${fixed(seconds, 2)} s`).join(', ')}.`,
    '',
    ...lines,
  ];
}

function operationRows(segment: Segment): string[] {
  const { hub, helper } = segment;
  const fromHelper = Object.entries(helper.ops)
    .sort((left, right) => right[1].totalMs - left[1].totalMs)
    .slice(0, 6)
    .map(
      ([name, op]) =>
        `| helper (call to reply) | ${name} | ${String(op.count)} | ${fixed(op.totalMs, 0)} | ${fixed(op.p50Ms, 2)} | ${fixed(op.p95Ms, 2)} | ${fixed(op.p99Ms, 2)} | ${fixed(op.maxMs, 1)} | |`,
    );
  const fromHub = Object.entries(hub.ops)
    .sort((left, right) => (right[1].run.totalMs ?? 0) - (left[1].run.totalMs ?? 0))
    .slice(0, 6)
    .map(
      ([name, op]) =>
        `| hub (execute) | ${name} | ${String(op.run.count ?? 0)} | ${fixed(op.run.totalMs ?? 0, 0)} | ${fixed(op.run.p50Ms ?? 0, 2)} | ${fixed(op.run.p95Ms ?? 0, 2)} | ${fixed(op.run.p99Ms ?? 0, 2)} | ${fixed(op.run.maxMs ?? 0, 1)} | ${fixed(op.wait.totalMs ?? 0, 0)} |`,
    );
  return [...fromHelper, ...fromHub];
}

async function segmentLabels(directory: string): Promise<string[]> {
  try {
    const names = await readdir(directory);
    return [
      ...new Set(
        names
          .filter((name) => name.endsWith('.hub.json'))
          .map((name) => name.slice(0, -'.hub.json'.length)),
      ),
    ].sort();
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
}

async function breakdown(directory: string, loads: readonly Load[]): Promise<string[]> {
  const labels = await segmentLabels(directory);
  if (labels.length === 0) return [];
  const out: string[] = ['## Where the time goes on the drive mount (per run and workload)', ''];
  for (const label of labels) {
    const segment = await readSegment(directory, label, loads);
    out.push(
      `### ${label}`,
      '',
      ...summaryLines(segment),
      '| side | operation | count | total ms | p50 ms | p95 ms | p99 ms | max ms | queue wait total ms |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...operationRows(segment),
      '',
    );
  }
  return out;
}
