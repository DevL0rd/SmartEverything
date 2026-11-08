import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUB_UPDATE_LEDGER_FILE } from '@smarteverything/domain';
import { buildSync } from 'esbuild';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';

const ROOT = join(import.meta.dirname, '..');

export const WATCHDOG_ENTRY = join(ROOT, 'tooling', 'self-update-watchdog.ts');

export const STEP_ENTRY = join(ROOT, 'tooling', 'self-update-step.ts');

const HUB_PACKAGE = '@smarteverything/hub';

export interface SelfUpdatePaths {
  readonly work: string;
  readonly ledger: string;
  readonly health: string;
  readonly log: string;
  readonly watchdogLog: string;
  readonly step: string;
}

export function selfUpdatePaths(layout: HubLayout): SelfUpdatePaths {
  const work = layout.system.updates.selfUpdate;
  return {
    work,
    ledger: join(work, HUB_UPDATE_LEDGER_FILE),
    health: join(work, 'healthy'),
    log: layout.system.logs.hubUpdateWatchdog,
    watchdogLog: join(work, 'watchdog.log'),
    step: join(work, 'step.mjs'),
  };
}

export function bundle(entry: string, outfile: string): string {
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
    banner: {
      js: 'import { createRequire as selfUpdateRequire } from "node:module"; const require = selfUpdateRequire(import.meta.url);',
    },
  });
  return outfile;
}

export function buildWatchdog(entry: string, outfile: string): string {
  if (readFileSync(entry, 'utf8').includes(HUB_PACKAGE)) {
    throw new Error(`The watchdog must not import ${HUB_PACKAGE}, or it dies with the hub`);
  }
  return bundle(entry, outfile);
}

export { latestRelease, readLedger, writeLedger } from './self-update-ledger.ts';
