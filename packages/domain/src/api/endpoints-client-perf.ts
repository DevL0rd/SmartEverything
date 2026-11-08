import { CLIENT_PERF_REPORT } from '../client-failures';
import { endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const CLIENT_PERF_ENDPOINTS = {
  reportClientPerf: endpoint({
    method: 'POST',
    path: '/api/clients/self/performance',
    access: 'member',
    summary: 'A paired app reports its own performance samples',
    params: NOTHING,
    query: NOTHING,
    body: CLIENT_PERF_REPORT,
    response: DONE,
  }),
};
