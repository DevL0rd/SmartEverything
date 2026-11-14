import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { HUB_UPDATE_CHECK, type HubUpdateCheck } from '@smarteverything/domain';
import { z } from 'zod';

export const JOB_ACTIONS = ['hub', 'app', 'ui', 'desktop', 'file'] as const;

export type JobAction = (typeof JOB_ACTIONS)[number];

export const JOB_PHASES = [
  'planned',
  'running',
  'applied',
  'published',
  'refused',
  'failed',
  'abandoned',
] as const;

export type JobPhase = (typeof JOB_PHASES)[number];

const MOMENT = z.iso.datetime({ offset: true });

export const UPDATE_JOB = z.strictObject({
  runId: z.uuid(),
  action: z.enum(JOB_ACTIONS),
  phase: z.enum(JOB_PHASES),
  input: z.record(z.string(), z.unknown()),
  identity: z.string().min(1).nullable(),
  runtime: z.string().min(1).nullable(),
  detail: z.string().max(4000).nullable(),
  checks: z.array(HUB_UPDATE_CHECK),
  result: z.record(z.string(), z.unknown()),
  steps: z.array(z.string()),
  startedAt: MOMENT,
  updatedAt: MOMENT,
});

export type UpdateJob = z.infer<typeof UPDATE_JOB>;

const FINISHED: ReadonlySet<JobPhase> = new Set(['applied', 'published', 'refused', 'failed']);

export interface JobStore {
  readonly folder: string;
  readonly now: () => Date;
  readonly newId: () => string;
}

function fileOf(store: JobStore, runId: string): string {
  return join(store.folder, `${z.uuid().parse(runId)}.json`);
}

export function readJob(store: JobStore, runId: string): UpdateJob | null {
  const file = fileOf(store, runId);
  return existsSync(file) ? UPDATE_JOB.parse(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

export function writeJob(store: JobStore, job: UpdateJob): UpdateJob {
  const checked = UPDATE_JOB.parse({ ...job, updatedAt: store.now().toISOString() });
  const file = fileOf(store, checked.runId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.next`, `${JSON.stringify(checked, null, 2)}\n`);
  renameSync(`${file}.next`, file);
  return checked;
}

export function startJob(
  store: JobStore,
  action: JobAction,
  input: Readonly<Record<string, unknown>>,
  identity: { readonly identity: string | null; readonly runtime: string | null } | null,
): UpdateJob {
  const at = store.now().toISOString();
  return writeJob(store, {
    runId: store.newId(),
    action,
    phase: 'planned',
    input,
    identity: identity?.identity ?? null,
    runtime: identity?.runtime ?? null,
    detail: null,
    checks: [],
    result: {},
    steps: [],
    startedAt: at,
    updatedAt: at,
  });
}

export function changeJob(store: JobStore, job: UpdateJob, change: Partial<UpdateJob>): UpdateJob {
  return writeJob(store, { ...job, ...change });
}

export function jobs(store: JobStore): readonly UpdateJob[] {
  if (!existsSync(store.folder)) return [];
  return readdirSync(store.folder)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      const file = join(store.folder, name);
      const parsed = UPDATE_JOB.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      return parsed.success ? [parsed.data] : [];
    })
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function latestJob(store: JobStore): UpdateJob | null {
  return jobs(store).at(-1) ?? null;
}

export function isFinished(job: UpdateJob): boolean {
  return FINISHED.has(job.phase);
}

export function openJob(
  store: JobStore,
  holderRunning: (job: UpdateJob) => boolean,
): UpdateJob | null {
  const last = latestJob(store);
  if (last === null || isFinished(last) || last.phase === 'abandoned') return null;
  if (holderRunning(last)) return last;
  changeJob(store, last, { phase: 'abandoned', detail: 'The update process ended unfinished.' });
  return null;
}

export function checkOf(name: string, ok: boolean, detail: string): HubUpdateCheck {
  return HUB_UPDATE_CHECK.parse({ name, ok, detail });
}
