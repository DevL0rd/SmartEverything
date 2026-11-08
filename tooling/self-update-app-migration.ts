import { APP_PUBLICATION } from '@smarteverything/domain';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changeJob, jobs, type JobStore } from './self-update-job.ts';

const MIGRATION = 'publication-desktop-receipts-v1';
const ANDROID_RECEIPT = APP_PUBLICATION.omit({ desktop: true });

export function migrateAppPublications(store: JobStore): void {
  const marker = join(store.folder, MIGRATION);
  if (existsSync(marker)) return;
  for (const job of jobs(store)) {
    if ((job.action !== 'app' && job.action !== 'ui') || Object.keys(job.result).length === 0)
      continue;
    if ('desktop' in job.result) {
      APP_PUBLICATION.parse(job.result);
      continue;
    }
    const receipt = ANDROID_RECEIPT.parse(job.result);
    changeJob(store, job, { result: { ...receipt, desktop: null } });
  }
  mkdirSync(store.folder, { recursive: true });
  writeFileSync(`${marker}.next`, 'Migrated retained Android publication receipts.\n', {
    mode: 0o600,
  });
  renameSync(`${marker}.next`, marker);
}
