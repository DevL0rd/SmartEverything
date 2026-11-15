import type { BadgeTone } from '../../../components/badge';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { clock } from '../../../format/time';
import type { BackupStatus } from './model/status';

export interface ThisPhoneCopy {
  readonly title: string;
  readonly left: string;
  readonly detail: readonly string[];
  readonly tone: BadgeTone;
}

function leftText(status: BackupStatus, left: number): string {
  const remaining = Math.max(0, left - status.failed);
  const failed = status.failed === 0 ? null : `${count(status.failed)} could not back up`;
  if (remaining === 0) return failed ?? 'Nothing left to back up';
  return joinParts([
    `${count(remaining)} left`,
    status.bytesLeft > 0 ? bytes(status.bytesLeft) : null,
    failed,
  ]);
}

function detailParts(status: BackupStatus): readonly string[] {
  const parts = [
    status.total === 0 ? null : `${count(status.done)} of ${count(status.total)} on the hub`,
    status.lastBackupAt === null ? null : `last backup ${clock(Date.parse(status.lastBackupAt))}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? ['Looking at this device’s photos'] : parts;
}

function toneOf(status: BackupStatus, left: number): BadgeTone {
  if (status.phase === 'paused') return 'warning';
  if (status.phase === 'uploading' || status.phase === 'scanning') return 'primary';
  if (status.failed > 0 || status.problem !== null) return 'critical';
  return left === 0 ? 'positive' : 'warning';
}

export function thisPhoneCopy(
  status: BackupStatus,
  name: string | null,
  left: number,
  device = 'phone',
): ThisPhoneCopy {
  return {
    title: name === null ? `This ${device}` : `This ${device} · ${name}`,
    left: leftText(status, left),
    detail: detailParts(status),
    tone: toneOf(status, left),
  };
}
