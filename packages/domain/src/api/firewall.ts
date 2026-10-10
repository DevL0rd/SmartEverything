import { z } from 'zod';
import { NO_BODY, endpoint } from './endpoint';
import { PLUGIN_ID } from '../plugins';
import { ID, MOMENT, NOTHING } from './primitives';

export const FIREWALL_BACKENDS = [
  'ufw',
  'firewalld',
  'nftables',
  'iptables',
  'windows',
  'macos',
  'none',
  'unknown',
] as const;

const FIREWALL_PROTOCOLS = ['tcp', 'udp'] as const;

export const OPENING_STATES = ['open', 'missing', 'denied', 'unknown'] as const;

export const CAMERA_REACH_STATES = [
  'open',
  'needs_rule',
  'blocked',
  'unreachable',
  'unknown',
] as const;

export const FIREWALL_GROUP = 'SmartEverything';

const FIREWALL_ADDRESS = z.union([z.ipv4(), z.ipv6()]);

const FIREWALL_NETWORK = z.union([z.cidrv4(), z.cidrv6()]);

const PORT = z.int().min(1).max(65_535);

const PROGRAM_PATH = z
  .string()
  .min(2)
  .max(1024)
  .regex(/^(\/|[A-Za-z]:\\)[^\0\r\n"`$]*$/, 'an absolute program path without quotes or $');

const ZONE_NAME = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

const CAMERA_RULE = z.strictObject({
  purpose: z.literal('camera'),
  protocol: z.literal('udp'),
  source: FIREWALL_ADDRESS,
});

const WEBRTC_RULE = z.strictObject({
  purpose: z.literal('webrtc'),
  protocol: z.enum(FIREWALL_PROTOCOLS),
  port: PORT,
});

const DEVICE_RULE = z.strictObject({
  purpose: z.literal('device'),
  protocol: z.literal('udp'),
  source: FIREWALL_ADDRESS,
});

const PLUGIN_RULE = z.strictObject({
  purpose: z.literal('plugin'),
  protocol: z.enum(FIREWALL_PROTOCOLS),
  port: PORT,
  source: FIREWALL_NETWORK,
});

const PORT_RULE = z.discriminatedUnion('purpose', [
  CAMERA_RULE,
  WEBRTC_RULE,
  DEVICE_RULE,
  PLUGIN_RULE,
]);

export type PortRule = z.infer<typeof PORT_RULE>;

export function ruleSource(rule: PortRule): string | null {
  return rule.purpose === 'webrtc' ? null : rule.source;
}

export function rulePort(rule: PortRule): number | null {
  return rule.purpose === 'webrtc' || rule.purpose === 'plugin' ? rule.port : null;
}

const FIREWALL_OPENING = z.strictObject({
  id: z.string().min(1).max(120),
  deviceIds: z.array(ID),
  pluginIds: z.array(PLUGIN_ID).default([]),
  rule: PORT_RULE,
  state: z.enum(OPENING_STATES),
});

export type FirewallOpening = z.infer<typeof FIREWALL_OPENING>;

const UFW_RULE = z.strictObject({ rule: PORT_RULE, prepend: z.boolean() });

export type UfwRule = z.infer<typeof UFW_RULE>;

export const UNPRIVILEGED_PORT_KEY = 'net.ipv4.ip_unprivileged_port_start';

export const UNPRIVILEGED_PORT_FILE = '/etc/sysctl.d/60-smarteverything-ports.conf';

const UNPRIVILEGED_PORT_START = PORT.nullable().default(null);

const LOW_PORTS = z.strictObject({
  start: PORT,
  state: z.enum(['open', 'missing', 'unknown']),
});

export type LowPorts = z.infer<typeof LOW_PORTS>;

const REVISION = z.string().regex(/^[0-9a-f]{16,64}$/);

const FIREWALL_PLAN = z.discriminatedUnion('backend', [
  z.strictObject({
    backend: z.literal('ufw'),
    revision: REVISION,
    rules: z.array(UFW_RULE),
    unprivilegedPortStart: UNPRIVILEGED_PORT_START,
  }),
  z.strictObject({
    backend: z.literal('firewalld'),
    revision: REVISION,
    zone: ZONE_NAME,
    rules: z.array(PORT_RULE),
    unprivilegedPortStart: UNPRIVILEGED_PORT_START,
  }),
  z.strictObject({
    backend: z.literal('sysctl'),
    revision: REVISION,
    unprivilegedPortStart: PORT,
  }),
  z.strictObject({
    backend: z.literal('windows'),
    revision: REVISION,
    program: PROGRAM_PATH,
    appProgram: PROGRAM_PATH,
    rules: z.array(PORT_RULE).min(1),
  }),
  z.strictObject({
    backend: z.literal('macos'),
    revision: REVISION,
    programs: z.array(PROGRAM_PATH).min(1),
  }),
]);

export type FirewallPlan = z.infer<typeof FIREWALL_PLAN>;

export type FirewallPlanBackend = FirewallPlan['backend'];

const CAMERA_REACH = z.strictObject({
  deviceId: ID,
  address: FIREWALL_ADDRESS,
  state: z.enum(CAMERA_REACH_STATES),
  failedAt: MOMENT.nullable(),
});

export type CameraReach = z.infer<typeof CAMERA_REACH>;

export const FIREWALL_STATUS = z.strictObject({
  checkedAt: MOMENT,
  backend: z.enum(FIREWALL_BACKENDS),
  filtering: z.boolean().nullable(),
  detail: z.string().min(1),
  openings: z.array(FIREWALL_OPENING),
  plan: FIREWALL_PLAN.nullable(),
  cameras: z.array(CAMERA_REACH),
  lowPorts: LOW_PORTS.nullable().default(null),
});

export type FirewallStatus = z.infer<typeof FIREWALL_STATUS>;

export type FirewallBackend = FirewallStatus['backend'];

export const FIREWALL_ENDPOINTS = {
  readFirewall: endpoint({
    method: 'GET',
    path: '/api/firewall',
    access: 'member',
    summary:
      'The active firewall, the openings cameras and pushing devices need, which are missing and the fix',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: FIREWALL_STATUS,
  }),
  checkFirewall: endpoint({
    method: 'POST',
    path: '/api/firewall/check',
    access: 'owner',
    summary: 'Detect the firewall and its rules again now, and return the result',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: FIREWALL_STATUS,
  }),
} as const;
