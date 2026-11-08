import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { syncDirectory } from './release-photo-paths.ts';
import { dirname } from 'node:path';
import {
  HUB_UPDATE_LEDGER,
  type HubUpdateLedger,
  type HubUpdateRelease,
} from '@smarteverything/domain';

export function readLedger(file: string): HubUpdateLedger {
  return existsSync(file)
    ? HUB_UPDATE_LEDGER.parse(JSON.parse(readFileSync(file, 'utf8')))
    : { releases: [] };
}

export function writeLedger(file: string, ledger: HubUpdateLedger): HubUpdateLedger {
  const checked = HUB_UPDATE_LEDGER.parse(ledger);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.next`, `${JSON.stringify(checked, null, 2)}\n`, {
    mode: 0o600,
    flush: true,
  });
  renameSync(`${file}.next`, file);
  syncDirectory(dirname(file));
  return checked;
}

export function latestRelease(ledger: HubUpdateLedger): HubUpdateRelease | undefined {
  return ledger.releases.at(-1);
}

const LEDGER_REASON_LIMIT = 2000;

export function ledgerReason(reason: string): string {
  const text = reason.trim();
  return text === '' ? 'No error detail was available' : text.slice(0, LEDGER_REASON_LIMIT);
}
