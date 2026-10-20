import {
  appliedDetailOf,
  appliedOutcomeOf,
  firewallSteps,
  manualScript,
  stepResultOf,
  type FirewallApplyResult,
  type FirewallPlan,
  type FirewallStatus,
  type FirewallStep,
  type FirewallStepResult,
} from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { FirewallMonitor } from './monitor';
import type { FirewallSystem } from './system';

const SUDO = 'sudo';
const SUDO_FLAGS = ['-n'] as const;
const SUDO_PROBE = [...SUDO_FLAGS, 'true'] as const;
const SUDO_BACKENDS: ReadonlySet<FirewallPlan['backend']> = new Set(['ufw', 'firewalld', 'sysctl']);
const DESKTOP_ONLY =
  'On this computer the firewall is changed from the SmartEverything desktop app, which asks the system for permission.';
const STALE =
  'The firewall or the cameras changed since these changes were shown; review them again.';

export interface FirewallApplierOptions {
  readonly system: FirewallSystem;
  readonly monitor: Pick<FirewallMonitor, 'check'>;
  readonly log: Logger;
}

export class FirewallApplier {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: FirewallApplierOptions) {}

  apply(revision: string): Promise<FirewallApplyResult> {
    const next = this.queue.then(() => this.applyNow(revision));
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async applyNow(revision: string): Promise<FirewallApplyResult> {
    const { monitor, log } = this.options;
    const before = await monitor.check();
    const plan = before.plan;
    if (plan?.revision !== revision) {
      log.info('firewall.apply_stale', { hasPlan: plan !== null });
      return {
        outcome: 'stale',
        via: null,
        steps: [],
        detail: STALE,
        commands: '',
        status: before,
      };
    }
    const reason = await this.unavailableReason(plan);
    if (reason !== null) {
      log.info('firewall.apply_unavailable', { backend: plan.backend });
      return unavailable(plan, reason, before);
    }
    const steps = firewallSteps(plan);
    log.info('firewall.apply_started', { backend: plan.backend, steps: steps.length });
    const results: FirewallStepResult[] = [];
    for (const step of steps) {
      results.push(await this.runStep(step));
    }
    const outcome = appliedOutcomeOf(results);
    log.info('firewall.apply_finished', {
      backend: plan.backend,
      outcome,
      failed: results.filter((result) => result.outcome === 'failed').length,
    });
    return {
      outcome,
      via: 'sudo',
      steps: results,
      detail: appliedDetailOf(results),
      commands: manualScript(plan),
      status: await monitor.check(),
    };
  }

  private async unavailableReason(plan: FirewallPlan): Promise<string | null> {
    const { system } = this.options;
    if (system.platform !== 'linux' || !SUDO_BACKENDS.has(plan.backend)) {
      return DESKTOP_ONLY;
    }
    const probe = await system.run(SUDO, SUDO_PROBE);
    if (probe === null) {
      return 'sudo is not installed on the server computer.';
    }
    if (probe.code !== 0) {
      const why = probe.stderr.trim();
      return `The server cannot use sudo without a password${why === '' ? '' : `: ${why}`}.`;
    }
    return null;
  }

  private async runStep(step: FirewallStep): Promise<FirewallStepResult> {
    const { system, log } = this.options;
    try {
      const answer = await system.run(SUDO, [...SUDO_FLAGS, step.program, ...step.args]);
      return answer === null
        ? stepResultOf(step, 1, 'sudo is not installed on the server computer.')
        : stepResultOf(step, answer.code, `${answer.stdout}\n${answer.stderr}`);
    } catch (cause: unknown) {
      log.warn('firewall.apply_step_crashed', { program: step.program, reason: messageOf(cause) });
      return stepResultOf(step, 1, messageOf(cause));
    }
  }
}

function unavailable(
  plan: FirewallPlan,
  detail: string,
  status: FirewallStatus,
): FirewallApplyResult {
  return {
    outcome: 'unavailable',
    via: null,
    steps: [],
    detail,
    commands: manualScript(plan),
    status,
  };
}
