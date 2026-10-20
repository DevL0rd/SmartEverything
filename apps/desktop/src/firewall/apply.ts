import {
  API_ENDPOINTS,
  FIREWALL_STATUS,
  allFailed,
  apiErrorOf,
  appliedDetailOf,
  appliedOutcomeOf,
  manualScript,
  type DesktopPlatform,
  type DesktopServer,
  type FirewallApplyResult,
  type FirewallPlan,
  type FirewallStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { CommandFailedError, type CommandResult } from '../service/system.js';
import { elevatedRunOf, type ElevatedRun } from './elevation.js';

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

type Attempt = Pick<FirewallApplyResult, 'outcome' | 'steps' | 'detail'>;

const DECLINED: Attempt = {
  outcome: 'declined',
  steps: [],
  detail: 'Nothing changed: the permission prompt was declined.',
};

function failedAttempt(elevated: ElevatedRun, error: CommandFailedError): Attempt {
  const reason = error.output === '' ? error.message : error.output;
  return { outcome: 'failed', steps: allFailed(elevated.steps, reason), detail: reason };
}

async function runApproved(options: FirewallApplierOptions, plan: FirewallPlan): Promise<Attempt> {
  const elevated = elevatedRunOf(plan, options.platform);
  log.info('firewall.applying', {
    backend: plan.backend,
    platform: options.platform,
    program: elevated.program,
  });
  try {
    const { stdout } = await options.run(elevated.program, elevated.args);
    const steps = elevated.resultsOf(stdout);
    log.info('firewall.applied', { backend: plan.backend, steps: steps.length });
    return { outcome: appliedOutcomeOf(steps), steps, detail: appliedDetailOf(steps) };
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
    return declined ? DECLINED : failedAttempt(elevated, error);
  }
}

export async function applyFirewall(
  options: FirewallApplierOptions,
  revision: string,
): Promise<FirewallApplyResult> {
  const read = await callFirewall(options, 'readFirewall');
  const { plan } = read;
  log.debug('firewall.apply_requested', {
    hasPlan: plan !== null,
    matches: plan?.revision === revision,
  });
  if (plan?.revision !== revision) {
    log.info('firewall.stale', { hasPlan: plan !== null });
    return {
      outcome: 'stale',
      via: null,
      steps: [],
      detail:
        'The firewall or the cameras changed since these changes were shown; review them again.',
      commands: '',
      status: read,
    };
  }
  const attempt = await runApproved(options, plan);
  const status = await callFirewall(options, 'checkFirewall');
  return { ...attempt, via: 'desktop', commands: manualScript(plan), status };
}
