import type { ProcessRow } from '@smarteverything/domain';
import { bytes, decimal } from '../../../format/number';

export type ProcessLayout = 'phone' | 'table' | 'full';

const TABLE_FROM = 640;
const FULL_FROM = 720;

export function layoutOf(bodyWidth: number): ProcessLayout {
  if (bodyWidth > FULL_FROM) return 'full';
  return bodyWidth > TABLE_FROM ? 'table' : 'phone';
}

export function cpuText(row: ProcessRow): string {
  return `${decimal(row.cpu, 1)} %`;
}

export function memoryText(row: ProcessRow): string {
  return bytes(row.memoryBytes);
}

export function gpuText(row: ProcessRow): string {
  return row.gpu === null ? '—' : `${decimal(row.gpu, 0)} %`;
}

export function diskText(row: ProcessRow): string {
  return row.diskRate > 0 ? `${bytes(row.diskRate)}/s` : '—';
}

export function userText(row: ProcessRow): string {
  return row.own ? 'you' : row.user;
}

export function helpersText(row: ProcessRow): string | null {
  return row.descendants > 0 ? `+${String(row.descendants)} helpers` : null;
}

export function spokenRow(row: ProcessRow): string {
  const helpers = row.descendants > 0 ? ` and ${String(row.descendants)} helpers` : '';
  return `${row.name}${helpers}, ${decimal(row.cpu, 1)} percent processor, ${memoryText(row)}`;
}

export function phoneLine(row: ProcessRow, gpu: boolean): string {
  return [gpu && row.gpu !== null ? `GPU ${gpuText(row)}` : null, userText(row)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
