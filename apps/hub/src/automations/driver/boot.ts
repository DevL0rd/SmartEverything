import { Logger } from '@smarteverything/logging';
import type { AutomationRunRecordsRepository } from '../../store/repositories/automation-run-records';
import type { RunDriver } from './admission';
import type { RunParkStore } from './park-store';
import { resumeRun } from './resume';
import type { ResumePorts, Resumed } from './resume';

export interface BootPorts extends ResumePorts {
  readonly records: Pick<
    AutomationRunRecordsRepository,
    'update' | 'waiting' | 'interruptUnfinished'
  >;
  readonly driver: Pick<RunDriver, 'adopt' | 'cancel'>;
  readonly parks: Pick<RunParkStore, 'adopted'>;
  readonly log?: Logger;
}

export interface BootReport {
  readonly resumed: number;
  readonly cancelled: number;
  readonly interrupted: number;
}

export function bootRuns(ports: BootPorts): BootReport {
  const log = ports.log ?? new Logger('hub.automations');
  ports.records.interruptUnfinished();
  const outcomes: Resumed[] = ports.records.waiting().map((record) => {
    const outcome = resumeRun(record, ports, {
      adopt: (start) => {
        ports.driver.adopt(start);
      },
      cancel: (runId, reason) => ports.driver.cancel(runId, reason),
      kept: (runId) => {
        ports.parks.adopted(runId);
      },
    });
    if (outcome.kind === 'interrupted')
      log.warn('automation.run_not_resumed', { runId: outcome.runId, error: outcome.error });
    return outcome;
  });
  const count = (kind: Resumed['kind']): number =>
    outcomes.filter((outcome) => outcome.kind === kind).length;
  const report = {
    resumed: count('resumed'),
    cancelled: count('cancelled'),
    interrupted: count('interrupted'),
  };
  log.info('automation.runs_booted', report);
  return report;
}

export function shutdownRuns(driver: Pick<RunDriver, 'shutdown'>, parks: RunParkStore): void {
  driver.shutdown(parks.kept);
}
