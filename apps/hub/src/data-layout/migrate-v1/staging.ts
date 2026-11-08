import { LEGACY_NAMES } from '../legacy';
import { V1_NAMES } from '../layout';
import type { NewStep } from './journal';

export const STAGED_BACKUPS = 'system/migration/staging-backups';

export function backupsStagingSteps(legacyBackupsExists: boolean): readonly NewStep[] {
  if (!legacyBackupsExists) {
    return [];
  }
  return [
    { kind: 'rename', from: LEGACY_NAMES.backups.manual, to: STAGED_BACKUPS },
    { kind: 'rename', from: STAGED_BACKUPS, to: V1_NAMES.backups.manual },
  ];
}

export function overlapsStagedBackups(target: string): boolean {
  const legacy = LEGACY_NAMES.backups.manual;
  return target === legacy || target.startsWith(`${legacy}/`);
}
