import {
  API_ENDPOINTS as E,
  type ClientCrumb,
  type ClientFailure,
  type ClientFailureReport,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { clientOf } from '../server/auth';
import { DONE_REPLY, bound, type ExtensionRouteTable } from '../server/router';
import { PERF_SCOPE, type PerfSamples } from './perf-samples';

interface Reporter {
  readonly clientId: string;
  readonly name: string;
  readonly platform: string;
  readonly release: string;
}

function logFailure(log: Logger, reporter: Reporter, failure: ClientFailure): void {
  const payload = {
    clientId: reporter.clientId,
    client: reporter.name,
    platform: reporter.platform,
    release: reporter.release,
    reportedAt: failure.at,
    scope: failure.scope,
    event: failure.event,
    screen: failure.screen,
    name: failure.name,
    message: failure.message,
    stack: failure.stack,
    ...(failure.processExit === undefined ? {} : { processExit: failure.processExit }),
  };
  if (failure.level === 'warn') {
    log.warn('client.failure_reported', payload);
    return;
  }
  log.error('client.failure_reported', undefined, payload);
}

function recordPerf(perf: PerfSamples, reporter: Reporter, failure: ClientFailure): void {
  perf.append({
    at: failure.at,
    clientId: reporter.clientId,
    client: reporter.name,
    platform: reporter.platform,
    release: reporter.release,
    screen: failure.screen,
    message: failure.message,
  });
}

function logCrumbs(log: Logger, reporter: Reporter, crumbs: readonly ClientCrumb[]): void {
  if (crumbs.length === 0) {
    return;
  }
  log.info('client.crumbs_reported', {
    clientId: reporter.clientId,
    client: reporter.name,
    crumbs: crumbs.map(
      (crumb) => `${crumb.at} ${crumb.scope} ${crumb.event} ${crumb.screen ?? ''}`,
    ),
  });
}

export function clientFailureRoutes(log: Logger, perf: PerfSamples): ExtensionRouteTable {
  const reports = log.forArea('hub.client-reports');
  return {
    reportClientFailures: bound(E.reportClientFailures, ({ body, caller }) => {
      const client = clientOf(caller);
      const report: ClientFailureReport = body;
      const reporter: Reporter = {
        clientId: client.id,
        name: client.name,
        platform: report.platform,
        release: report.release,
      };
      let sampled = 0;
      report.failures.forEach((failure) => {
        if (failure.scope === PERF_SCOPE) {
          recordPerf(perf, reporter, failure);
          sampled += 1;
          return;
        }
        logFailure(reports, reporter, failure);
      });
      if (sampled > 0) {
        reports.debug('client.perf_reported', { clientId: reporter.clientId, lines: sampled });
      }
      logCrumbs(reports, reporter, report.recent ?? []);
      return DONE_REPLY;
    }),
  };
}
