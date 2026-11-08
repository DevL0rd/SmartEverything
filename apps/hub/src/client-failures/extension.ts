import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { directClient } from '../server/auth';
import { clip } from '@smarteverything/logging';
import { DONE_REPLY, bound, type ExtensionRouteTable } from '../server/router';
import type { PerfSamples } from './perf-samples';

const PERF_LINE_MAX = 400;

export function clientPerfRoutes(perf: PerfSamples): ExtensionRouteTable {
  return {
    reportClientPerf: bound(E.reportClientPerf, ({ body, caller }) => {
      const client = directClient(caller);
      if (client === undefined) {
        throw new ApiError('forbidden', 'Only a paired app may send its performance samples.');
      }
      for (const line of body.lines) {
        perf.append({
          at: body.at,
          clientId: client.id,
          client: client.name,
          platform: client.platform,
          release: body.release,
          screen: clip(body.screen, 120),
          message: clip(line, PERF_LINE_MAX),
        });
      }
      return DONE_REPLY;
    }),
  };
}
