import { describe, expect, it } from 'vitest';
import { JobId } from '@deepseek-ai/dsh-jobs';
import type { JobView } from '@deepseek-ai/dsh-jobs';
import { SessionId } from '@deepseek-ai/dsh-session';
import { cancelOwnedJobs, JOB_CLEANUP_WINDOW_MS } from '../src/host/job-cleanup';

const OWNER = SessionId('session-jobs');

function view(status: JobView['status'], total: number): JobView {
  return {
    id: JobId('bash-1'),
    kind: 'bash',
    label: 'build',
    owner: OWNER,
    status,
    startedAt: 0,
    output: { total, earliest: 0 },
  };
}

function jobsReturning(...waits: JobView[]): {
  readonly jobs: {
    list: () => JobView[];
    kill: () => 'requested';
    wait: (id: JobId, timeoutMs: number, caller?: SessionId) => Promise<JobView>;
  };
  readonly waited: { id: JobId; timeoutMs: number; caller: SessionId | undefined }[];
} {
  const waited: { id: JobId; timeoutMs: number; caller: SessionId | undefined }[] = [];
  let settled = false;
  return {
    waited,
    jobs: {
      list: (): JobView[] => (settled ? [] : [view('running', 0)]),
      kill: (): 'requested' => 'requested',
      wait: (id, timeoutMs, caller): Promise<JobView> => {
        waited.push({ id, timeoutMs, caller });
        const next = waits.shift();
        if (next === undefined) throw new Error('The fake job was waited on too often.');
        settled = next.status === 'killed';
        return Promise.resolve(next);
      },
    },
  };
}

describe('closing a session that owns background jobs', () => {
  it('keeps waiting while the killed job is still writing and finishes when it settles', async () => {
    const { jobs, waited } = jobsReturning(
      view('stopping', 10),
      view('stopping', 20),
      view('killed', 20),
    );
    await expect(cancelOwnedJobs({ jobs }, { id: OWNER }, 'closing')).resolves.toBeUndefined();
    expect(waited).toEqual(
      Array.from({ length: 3 }, () => ({
        id: JobId('bash-1'),
        timeoutMs: JOB_CLEANUP_WINDOW_MS,
        caller: OWNER,
      })),
    );
  });

  it('gives up on a job that went quiet for a whole window', async () => {
    const { jobs } = jobsReturning(view('stopping', 10), view('stopping', 10));
    await expect(cancelOwnedJobs({ jobs }, { id: OWNER }, 'closing')).rejects.toThrow(
      'Owned job cleanup is incomplete: bash-1',
    );
  });
});
