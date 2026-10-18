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
import { Logger } from '@smarteverything/logging';
import { CommandFailedError, type CommandResult } from '../service/system.js';
import { elevatedRunOf } from './elevation.js';

const log = new Logger('desktop.firewall');

export interface FirewallApplierOptions {
  readonly platform: DesktopPlatform;
  readonly server: () => Promise<DesktopServer | null>;
  readonly fetch: typeof fetch;
  readonly run: (file: string, args: readonly string[]) => Promise<CommandResult>;
}

type FirewallCall = 'readFirewall' | 'checkFirewall';

class WindowNotPairedError extends Error {
  constructor() {
    super('pair this window with your home before changing its firewall');
    this.name = 'WindowNotPairedError';
  }
}

class FirewallAnswerError extends Error {
  constructor(call: FirewallCall, issues: string) {
    super(`${call} answers a firewall status; the server sent something else: ${issues}`);
    this.name = 'FirewallAnswerError';
  }
}

async function callFirewall(
  options: FirewallApplierOptions,
  call: FirewallCall,
): Promise<FirewallStatus> {
  const server = await options.server();
  if (server === null) {
    log.warn('firewall.not_paired', { call });
    throw new WindowNotPairedError();
  }
  const endpoint = API_ENDPOINTS[call];
  const response = await options.fetch(new URL(endpoint.path, server.url), {
    method: endpoint.method,
    headers: { authorization: `Bearer ${server.token}` },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw apiErrorOf(response.status, body);
  }
  log.debug('firewall.status_read', { call, httpStatus: response.status });
  const parsed = FIREWALL_STATUS.safeParse(body);
  if (!parsed.success) {
    log.warn('firewall.answer_invalid', { call });
    throw new FirewallAnswerError(call, parsed.error.message);
  }
  return parsed.data;
}

async function runApproved(
  options: FirewallApplierOptions,
  plan: FirewallPlan,
): Promise<DesktopFirewallResult> {
  const elevated = elevatedRunOf(plan, options.platform);
  log.info('firewall.applying', {
    backend: plan.backend,
    platform: options.platform,
    program: elevated.program,
  });
  try {
    await options.run(elevated.program, elevated.args);
    log.info('firewall.applied', { backend: plan.backend });
    return { outcome: 'applied', detail: 'The firewall now lets the cameras and live video in.' };
  } catch (error: unknown) {
    if (!(error instanceof CommandFailedError)) {
      throw error;
    }
    const declined = elevated.declinedWhen(error.exitCode, error.output);
    log.warn('firewall.apply_failed', {
      backend: plan.backend,
      exitCode: error.exitCode,
      declined,
      outputBytes: error.output.length,
    });
    if (declined) {
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
  log.debug('firewall.apply_requested', {
    hasPlan: plan !== null,
    matches: plan?.revision === revision,
  });
  if (plan?.revision !== revision) {
    log.info('firewall.stale', { hasPlan: plan !== null });
    return {
      outcome: 'stale',
      detail:
        'The firewall or the cameras changed since these changes were shown; review them again.',
    };
  }
  const result = await runApproved(options, plan);
  await callFirewall(options, 'checkFirewall');
  return result;
}
