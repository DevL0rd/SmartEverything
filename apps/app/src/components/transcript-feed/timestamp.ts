import { dateFormat } from '../../format/locale';

export function transcriptTimestamp(at: string, timeZone: string): string {
  return dateFormat({
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  }).format(new Date(at));
}
