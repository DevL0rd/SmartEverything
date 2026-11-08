import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  HUB_UPDATE_CHECK,
  hubUpdateFinished,
  hubUpdateOutcome,
  type HubUpdateCheck,
  type HubUpdateOutcome,
  type HubUpdateOrigin,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { latestRelease, readLedger, writeLedger } from './self-update-files.ts';

const OUTPUT_TAIL = 2000;

export interface PlanTools {
  readonly ledger: string;
  readonly watchdogLog: string;
  readonly now: () => Date;
  readonly newId: () => string;
}

export type Outcome =
  | { readonly known: true; readonly outcome: HubUpdateOutcome; readonly release: HubUpdateRelease }
  | { readonly known: false; readonly message: string };

export interface PlanFields {
  readonly notes: string;
  readonly origin?: HubUpdateOrigin;
  readonly remoteTip?: string;
  readonly build: string | null;
  readonly backup: string | null;
  readonly url: string;
  readonly healthFile: string;
  readonly watchdogUnit: string;
  readonly installs: readonly string[];
  readonly startingSchema: number | null;
}

export function recorded(tools: PlanTools, release: HubUpdateRelease): void {
  const ledger = readLedger(tools.ledger);
  const kept = ledger.releases.filter((entry) => entry.runId !== release.runId);
  writeLedger(tools.ledger, { releases: [...kept, release] });
}

export function update(
  tools: PlanTools,
  release: HubUpdateRelease,
  change: Partial<HubUpdateRelease>,
): HubUpdateRelease {
  const next: HubUpdateRelease = {
    ...release,
    ...change,
    revision: release.revision + 1,
    updatedAt: tools.now().toISOString(),
  };
  recorded(tools, next);
  return next;
}

export function plan(tools: PlanTools, fields: PlanFields): HubUpdateRelease {
  const at = tools.now().toISOString();
  const release: HubUpdateRelease = {
    runId: tools.newId(),
    ...(fields.origin === undefined ? {} : { origin: fields.origin }),
    ...(fields.remoteTip === undefined ? {} : { remoteTip: fields.remoteTip }),
    phase: 'planned',
    build: fields.build,
    backup: fields.backup,
    url: fields.url,
    healthFile: fields.healthFile,
    watchdogUnit: fields.watchdogUnit,
    startingSchema: fields.startingSchema,
    changedDatabase: false,
    installs: [...fields.installs],
    notes: fields.notes,
    checks: [],
    failedChecks: [],
    reason: null,
    interrupted: false,
    revision: 0,
    startedAt: at,
    updatedAt: at,
    finishedAt: null,
  };
  recorded(tools, release);
  return release;
}

export function unfinished(ledgerFile: string): HubUpdateRelease | null {
  const last = latestRelease(readLedger(ledgerFile));
  return last === undefined || hubUpdateFinished(last) ? null : last;
}

export function outcomeOf(ledgerFile: string, runId: string): Outcome {
  const ledger = readLedger(ledgerFile);
  const release = ledger.releases.find((entry) => entry.runId === runId);
  const outcome = release === undefined ? null : hubUpdateOutcome(release);
  return release === undefined || outcome === null
    ? {
        known: false,
        message: `the hub update ${runId} is not finished, so the hub is down until it is. Run \`npx tsx tooling/recover-hub.ts\`, then action recover with this id.`,
      }
    : { known: true, outcome, release };
}

function endingOf(release: HubUpdateRelease): string {
  return release.finishedAt ?? release.updatedAt;
}

export function lastOutcome(ledgerFile: string): Outcome | null {
  const releases = readLedger(ledgerFile)
    .releases.filter((release) => hubUpdateFinished(release))
    .sort((left, right) => endingOf(left).localeCompare(endingOf(right)));
  const last = releases.at(-1);
  return last === undefined ? null : outcomeOf(ledgerFile, last.runId);
}

export function logTail(file: string, lines: number): readonly string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').slice(-lines);
}

export function note(file: string, event: string, fields: Readonly<Record<string, unknown>>): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(
    file,
    `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event, ...fields })}\n`,
  );
}

export function failureTail(output: string): string {
  return output.trim().slice(-OUTPUT_TAIL);
}

export function withCheck(release: HubUpdateRelease, check: HubUpdateCheck): HubUpdateRelease {
  return { ...release, checks: [...release.checks, HUB_UPDATE_CHECK.parse(check)] };
}
