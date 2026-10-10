import { CLIENT_FAILURE_REPORT } from '../client-failures';
import { endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const CLIENT_FAILURE_ENDPOINTS = {
  reportClientFailures: endpoint({
    method: 'POST',
    path: '/api/clients/self/failures',
    access: 'member',
    summary:
      'An app reports the redacted errors it hit since it last reached the server, with the screen each happened on, so a crash can be diagnosed from the server log',
    params: NOTHING,
    query: NOTHING,
    body: CLIENT_FAILURE_REPORT,
    response: DONE,
  }),
};
