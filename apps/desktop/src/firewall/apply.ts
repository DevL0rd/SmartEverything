import {
  API_ENDPOINTS,
  FIREWALL_STATUS,
  apiErrorOf,
  type DesktopFirewallResult,
  type DesktopPlatform,
  type DesktopServer,
  type FirewallPlan,
  type FirewallStatus,
} from '@smarteverything/domain';
import { CommandFailedError, type CommandResult } from '../service/system.js';
import { elevatedRunOf } from './elevation.js';

export interface FirewallApplierOptions {
  readonly platform: DesktopPlatform;
  readonly go2rtcBinary: string;
  readonly appBinary: string;
  readonly server: () => Promise<DesktopServer>;
  readonly fetch: typeof fetch;
  readonly run: (file: string, args: readonly string[]) => Promise<CommandResult>;
}

type FirewallCall = 'readFirewall' | 'checkFirewall';

class FirewallAnswerError extends Error {
  constructor(call: FirewallCall, issues: string) {
    super(`${call} answers a firewall status; the server sent something else: ${issues}`);
    this.name = 'FirewallAnswerError';
  }
}

class ForeignProgramError extends Error {
  constructor(program: string, expected: readonly string[]) {
    super(
      `a firewall plan may only allow ${expected.join(' or ')}; the server proposed ${program}`,
    );
    this.name = 'ForeignProgramError';
  }
}

async function callFirewall(
  options: FirewallApplierOptions,
  call: FirewallCall,
): Promise<FirewallStatus> {
  const server = await options.server();
  const endpoint = API_ENDPOINTS[call];
  const response = await options.fetch(new URL(endpoint.path, server.url), {
    method: endpoint.method,
    headers: { authorization: `Bearer ${server.token}` },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw apiErrorOf(response.status, body);
  }
  const parsed = FIREWALL_STATUS.safeParse(body);
  if (!parsed.success) {
    throw new FirewallAnswerError(call, parsed.error.message);
  }
  return parsed.data;
}

function programsOf(plan: FirewallPlan): readonly string[] {
  switch (plan.backend) {
    case 'windows':
      return [plan.program];
    case 'macos':
      return plan.programs;
    case 'ufw':
    case 'firewalld':
      return [];
  }
}

function checkPrograms(options: FirewallApplierOptions, plan: FirewallPlan): void {
  const allowed = [options.go2rtcBinary, options.appBinary];
  const foreign = programsOf(plan).find((program) => !allowed.includes(program));
  if (foreign !== undefined) {
    throw new ForeignProgramError(foreign, allowed);
  }
}

async function runApproved(
  options: FirewallApplierOptions,
  plan: FirewallPlan,
): Promise<DesktopFirewallResult> {
  const elevated = elevatedRunOf(plan, options.platform);
  try {
    await options.run(elevated.program, elevated.args);
    return { outcome: 'applied', detail: 'The firewall now lets the cameras and live video in.' };
  } catch (error: unknown) {
    if (!(error instanceof CommandFailedError)) {
      throw error;
    }
    if (elevated.declinedWhen(error.exitCode, error.output)) {
      return {
        outcome: 'declined',
        detail: 'Nothing changed: the permission prompt was declined.',
      };
    }
    return { outcome: 'failed', detail: error.output === '' ? error.message : error.output };
  }
}

export async function applyFirewall(
  options: FirewallApplierOptions,
  revision: string,
): Promise<DesktopFirewallResult> {
  const { plan } = await callFirewall(options, 'readFirewall');
  if (plan?.revision !== revision) {
    return {
      outcome: 'stale',
      detail:
        'The firewall or the cameras changed since these changes were shown; review them again.',
    };
  }
  checkPrograms(options, plan);
  const result = await runApproved(options, plan);
  await callFirewall(options, 'checkFirewall');
  return result;
}
