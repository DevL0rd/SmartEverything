import type { PrinterJob } from '@smarteverything/domain';
import type { ViewOf } from '../data/printer-api';
import { countLabel } from './format';

export type HistoryFilter = 'all' | 'completed' | 'canceled' | 'aborted';

export const HISTORY_OPTIONS: readonly { readonly value: HistoryFilter; readonly label: string }[] =
  [
    { value: 'all', label: 'All' },
    { value: 'completed', label: 'Done' },
    { value: 'canceled', label: 'Canceled' },
    { value: 'aborted', label: 'Failed' },
  ];

export const RESULT_LABEL: Readonly<Record<PrinterJob['state'], string>> = {
  pending: 'Waiting',
  held: 'On hold',
  processing: 'Printing',
  stopped: 'Stopped',
  canceled: 'Canceled',
  aborted: 'Failed',
  completed: 'Done',
};

export function jobSubtitle(job: PrinterJob): string {
  const colour =
    job.color !== null && job.color > 0 ? 'Colour' : job.mono !== null ? 'Black and white' : null;
  return [
    job.pages === null ? null : countLabel(job.pages, 'page'),
    colour,
    job.duplex === true ? 'Two-sided' : null,
    job.person,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export type HistoryRow =
  | { readonly kind: 'job'; readonly key: string; readonly at: number; readonly job: PrinterJob }
  | { readonly kind: 'gap'; readonly key: string; readonly at: number; readonly text: string };

export function historyRows(view: ViewOf<'jobs'>): readonly HistoryRow[] {
  const jobs = view.jobs.map((job): HistoryRow => ({
    kind: 'job',
    key: job.key,
    at: Date.parse(job.completedAt ?? job.createdAt ?? '1970-01-01T00:00:00Z'),
    job,
  }));
  const gaps = view.gaps.map((gap): HistoryRow => ({
    kind: 'gap',
    key: `gap-${gap.from}`,
    at: Date.parse(gap.to),
    text:
      gap.atLeastPages === null
        ? 'Not recorded: the hub could not reach the printer, jobs unknown'
        : `Not recorded: at least ${countLabel(gap.atLeastPages, 'page')}, jobs unknown`,
  }));
  return [...jobs, ...gaps].sort((left, right) => right.at - left.at);
}
