import type { SummaryTone } from '@smarteverything/domain';
import type { PrinterLive } from '../../../features/device-visuals';

export interface PrinterStatus {
  readonly tone: SummaryTone;
  readonly text: string;
  readonly progress: number | null;
}

export function statusOf(live: PrinterLive): PrinterStatus {
  const progress =
    live.state === 'printing' && live.jobProgress !== null ? live.jobProgress / 100 : null;
  return live.online
    ? { tone: live.summary.tone, text: live.summary.text, progress }
    : { tone: 'asleep', text: 'Offline', progress: null };
}
