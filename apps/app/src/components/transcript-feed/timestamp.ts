import { dateFormat } from '../../format/locale';

export function transcriptTime(at: string, timeZone: string): string {
  return dateFormat({
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  }).format(new Date(at));
}
