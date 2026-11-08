import type { BadgeTone } from '../../../components/badge';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { clock } from '../../../format/time';
import type { BackupStatus } from './model/status';

export interface ThisPhoneCopy {
  readonly title: string;
  readonly left: string;
  readonly detail: string;
  readonly tone: BadgeTone;
}

function leftText(status: BackupStatus, left: number): string {
  if (left === 0) return 'Nothing left to back up';
  return joinParts([`${count(left)} left`, status.bytesLeft > 0 ? bytes(status.bytesLeft) : null]);
}

function detailText(status: BackupStatus): string {
  const parts = [
    status.total === 0 ? null : `${count(status.done)} of ${count(status.total)} on the hub`,
    status.failed === 0 ? null : `${count(status.failed)} could not back up`,
    status.lastBackupAt === null ? null : `last backup ${clock(Date.parse(status.lastBackupAt))}`,
  ];
  const text = joinParts(parts);
  return text === '' ? 'Looking at this device’s photos' : text;
}

function toneOf(status: BackupStatus, left: number): BadgeTone {
  if (status.phase === 'paused') return 'warning';
  if (status.phase === 'uploading' || status.phase === 'scanning') return 'primary';
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
    detail: detailText(status),
    tone: toneOf(status, left),
  };
}
