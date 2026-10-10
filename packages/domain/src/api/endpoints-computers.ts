import { z } from 'zod';
import { COMPUTER_SCOPES, COMPUTER_SCOPES_PATCH } from '../node/computer-scopes';
import { PROCESS_LIST, PROCESS_QUERY, PROCESS_SIGNALS } from '../node/computer-processes';
import { COMPUTER_SESSION } from '../node/computer-session-state';
import { COMPUTER_SNAPSHOT } from '../node/computer-snapshot';
import { CONNECT_LINK } from '../node/connect-links';
import { METRIC_RANGES, METRIC_SERIES } from '../node/metrics';
import { COMPUTER_ACTIONS } from '../node/node-requests';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

export const COMPUTER_METRICS = [
  'cpu_load',
  'memory_used',
  'gpu_load',
  'disk_used',
  'cpu_temperature',
  'gpu_temperature',
  'download_rate',
  'upload_rate',
] as const;

export type ComputerMetric = (typeof COMPUTER_METRICS)[number];

const COMPUTER_PARAMS = z.strictObject({ deviceId: ID });

export const COMPUTER_DETAIL = z.strictObject({
  deviceId: ID,
  online: z.boolean(),
  snapshot: COMPUTER_SNAPSHOT.nullable(),
  session: COMPUTER_SESSION.nullable().default(null),
  scopes: COMPUTER_SCOPES,
  actions: z.array(z.enum(COMPUTER_ACTIONS)),
  links: z.array(CONNECT_LINK),
});

export type ComputerDetail = z.infer<typeof COMPUTER_DETAIL>;

export const COMPUTER_ENDPOINTS = {
  readComputer: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId',
    access: 'member',
    summary:
      'One computer now: processor per core, memory, disks, network, graphics, temperatures and fans, its permissions, the power actions it offers and links to connect (SSH, Remote Desktop, VNC, Moonlight)',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: COMPUTER_DETAIL,
  }),
  readComputerMetrics: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/metrics',
    access: 'member',
    summary:
      'A computer reading over time: the last 10 minutes by second, 24 hours by minute or 30 days by hour, with minimum and maximum',
    params: COMPUTER_PARAMS,
    query: z.strictObject({ capability: z.enum(COMPUTER_METRICS), range: z.enum(METRIC_RANGES) }),
    body: NO_BODY,
    response: METRIC_SERIES,
  }),
  listComputerProcesses: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/processes',
    access: 'owner',
    summary:
      'Programs running on a computer, busiest first by processor, memory or disk, up to 50, optionally matching a name',
    params: COMPUTER_PARAMS,
    query: PROCESS_QUERY,
    body: NO_BODY,
    response: PROCESS_LIST,
  }),
  signalComputerProcess: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/signal',
    access: 'owner',
    summary:
      'End, force quit, pause or resume one of the signed-in person’s own programs on a computer; unsaved work in it can be lost',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: z.strictObject({ pid: z.int().positive(), signal: z.enum(PROCESS_SIGNALS) }),
    response: DONE,
  }),
  readComputerScopes: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/scopes',
    access: 'owner',
    summary:
      'What SmartEverything may do on a computer, and whether the AI may use its power actions',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: COMPUTER_SCOPES,
  }),
  updateComputerScopes: endpoint({
    method: 'PATCH',
    path: '/api/computers/:deviceId/scopes',
    access: 'owner',
    summary: 'Change what SmartEverything may do on a computer',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: COMPUTER_SCOPES_PATCH,
    response: COMPUTER_SCOPES,
  }),
};
