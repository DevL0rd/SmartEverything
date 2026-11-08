import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PrinterJob } from '@smarteverything/ipp';
import {
  JobObserver,
  type JobNotice,
  type SubmittedInfo,
} from '../../../src/plugins/builtin/printer/job-observer';
import type { PrinterSession } from '../../../src/plugins/builtin/printer/session';
import { FakeIppPrinter } from './fake-ipp-printer';
import { newRig, openSession } from './rig';

let printer: FakeIppPrinter;
let session: PrinterSession;
let finals: Map<number, PrinterJob>;
let notices: JobNotice[];
let observer: JobObserver;

beforeEach(async () => {
  printer = new FakeIppPrinter();
  await printer.start();
  const rig = newRig();
  session = await openSession(rig, printer);
  finals = new Map();
  notices = [];
  observer = new JobObserver({
    client: {
      jobs: (): Promise<PrinterJob[]> => Promise.resolve([]),
      job: (id): Promise<PrinterJob | null> => Promise.resolve(finals.get(id) ?? null),
    },
    ledger: session.ledger,
    epoch: (): number => 7,
    upTime: (): number | null => null,
    now: (): Date => new Date('2026-10-25T10:00:00.000Z'),
    notify: (notice): void => {
      notices.push(notice);
    },
  });
});

afterEach(async () => {
  session.stop();
  await printer.stop();
});

function jobOf(id: number, patch: Partial<PrinterJob>): PrinterJob {
  return {
    id,
    uuid: null,
    name: `Document ${String(id)}`,
    user: 'anna',
    state: 'pending',
    reasons: [],
    printerReasons: [],
    message: null,
    createdAt: null,
    startedAt: null,
    completedAt: null,
    createdDate: null,
    startedDate: null,
    completedDate: null,
    impressions: 2,
    impressionsDone: null,
    sheets: null,
    sheetsDone: null,
    progress: null,
    kOctets: null,
    copies: 1,
    format: 'application/pdf',
    ahead: null,
    printerUpTime: null,
    color: null,
    mono: null,
    ...patch,
  };
}

const INFO: SubmittedInfo = {
  person: 'anna',
  name: 'Report',
  format: 'application/pdf',
  copies: 1,
  colorMode: null,
  sides: null,
};

describe('the job key a print returns and the job that finishes', () => {
  it('finishes the same key the print returned, also when the printer only reveals a uuid later', async () => {
    const submitted = observer.registerSubmitted(jobOf(11, { uuid: null }), INFO);
    finals.set(11, jobOf(11, { uuid: 'urn:uuid:job-11', state: 'completed', impressionsDone: 2 }));
    await observer.observe();
    const finished = notices.filter((notice) => notice.kind === 'job_finished');
    expect(finished).toHaveLength(1);
    expect(finished[0]?.job.key).toBe(submitted?.key);
    expect(finished[0]?.job.state).toBe('completed');
  });

  it('keeps the keys of two jobs apart, each finishing under its own key', async () => {
    const first = observer.registerSubmitted(jobOf(21, { uuid: 'urn:uuid:a' }), INFO);
    const second = observer.registerSubmitted(jobOf(22, { uuid: 'urn:uuid:b' }), INFO);
    finals.set(22, jobOf(22, { uuid: 'urn:uuid:b', state: 'canceled' }));
    finals.set(21, jobOf(21, { uuid: 'urn:uuid:a', state: 'completed', impressionsDone: 2 }));
    await observer.observe();
    expect(first?.key).not.toBe(second?.key);
    expect(new Map(notices.map((notice) => [notice.job.key, notice.job.state]))).toEqual(
      new Map([
        [first?.key, 'completed'],
        [second?.key, 'canceled'],
      ]),
    );
  });
});
