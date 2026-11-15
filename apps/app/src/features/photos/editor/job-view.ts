import type { EditJob } from '@smarteverything/domain';

export interface EditJobView {
  readonly progress: number | null;
  readonly label: string;
}

export function jobViewOf(job: EditJob | null): EditJobView {
  if (job === null || job.state === 'queued')
    return { progress: null, label: 'Video edit waiting to start' };
  const percent = Math.round(job.progress * 100);
  return { progress: job.progress, label: `Saving the edited video, ${String(percent)}%` };
}
