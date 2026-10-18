import { z } from 'zod';
import { MACHINE_ACTION_SUPPORTS, MACHINE_PERMISSION_STATES } from '../machine-actions';
import { COMPUTER_SCOPES, COMPUTER_SCOPES_PATCH } from '../node/computer-scopes';
import { PROCESS_LIST, PROCESS_QUERY, PROCESS_SIGNALS } from '../node/computer-processes';
import { COMPUTER_FEATURE_LIST } from '../node/computer-features';
import { COMPUTER_PARTS } from '../node/computer-live';
import { CONNECT_LINK } from '../node/connect-links';
import { METRIC_RANGES, METRIC_SERIES } from '../node/metrics';
import { COMPUTER_ACTIONS } from '../node/node-requests';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

export const COMPUTER_METRICS = [
  'cpu_load',
  'memory_used',
  'swap_used',
  'gpu_load',
  'gpu_memory_used',
  'disk_used',
  'cpu_temperature',
  'gpu_temperature',
  'cpu_power',
  'gpu_power',
  'download_rate',
  'upload_rate',
  'battery_level',
] as const;

export type ComputerMetric = (typeof COMPUTER_METRICS)[number];

const COMPUTER_PARAMS = z.strictObject({ deviceId: ID });

const COMPUTER_READ_QUERY = z.strictObject({
  fresh: z
    .stringbool()
    .optional()
    .describe('Wait for a new reading of every metric instead of what is on screen right now'),
});

export const COMPUTER_DETAIL = z.strictObject({
  deviceId: ID,
  online: z.boolean(),
  at: z.iso.datetime({ offset: true }).nullable(),
  features: COMPUTER_FEATURE_LIST,
  parts: COMPUTER_PARTS,
  scopes: COMPUTER_SCOPES,
  actions: z.array(z.enum(COMPUTER_ACTIONS)),
  machineActions: MACHINE_ACTION_SUPPORTS,
  permissions: MACHINE_PERMISSION_STATES,
});

export type ComputerDetail = z.infer<typeof COMPUTER_DETAIL>;

export const COMPUTER_ENDPOINTS = {
  readComputer: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId',
    access: 'member',
    summary:
      'One computer now: summary, processor per core, memory, disks, network, graphics, temperatures, fans, power, sound, screens, system, windows and services as far as it offers them, its permissions, and the power actions it offers',
    params: COMPUTER_PARAMS,
    query: COMPUTER_READ_QUERY,
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
  listComputerLinks: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/links',
    access: 'member',
    summary:
      'Links to connect to a computer now (SSH, Remote Desktop, VNC, Moonlight); empty while it is offline',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(CONNECT_LINK),
  }),
  listComputerProcesses: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/processes',
    access: 'member',
    summary:
      'Programs running on a computer, busiest first by processor, memory, graphics or disk or sorted by name, threads, user or id, optionally matching a name and as a tree, 50 at a time: pass next from the answer as cursor for the following page',
    params: COMPUTER_PARAMS,
    query: PROCESS_QUERY,
    body: NO_BODY,
    response: PROCESS_LIST,
  }),
  signalComputerProcess: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/signal',
    access: 'member',
    summary:
      'End, force quit, pause or resume a program on a computer; the computer refuses programs that belong to another user, and unsaved work in it can be lost',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: z.strictObject({
      pid: z.int().positive(),
      signal: z.enum(PROCESS_SIGNALS),
      confirm: z.boolean().optional(),
    }),
    response: DONE,
  }),
  readComputerScopes: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/scopes',
    access: 'member',
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
