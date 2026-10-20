import { JSON_VALUE } from '@smarteverything/domain';
import type { ErrorClass, JsonValue } from '@smarteverything/domain';
import type {
  Checked,
  EffectRequest,
  NodeResult,
  Outputs,
} from '@smarteverything/flow/interpret/frames';
import { RUN_AUTOMATION_KIND } from '@smarteverything/flow/interpret/run-automation';
import type { z } from 'zod';
import type { Clock } from '../../clock';
import type { RunScope } from '../driver/ports';
import { KEPT_PARAMS, VARIABLE_PARAMS, nextOf, outputs, parsed } from '../engine-v3-effects';
import { ReadFailure } from '../world-v3/read-port';
import { deviceRefs } from '../world-v3/refs';
import type { EffectOutcome, EffectScript } from './scenario';
import { CONTROL_DEFAULT } from './world-sim';
import type { ScenarioWorld } from './world-sim';

export interface WouldSend {
  readonly at: string;
  readonly runId: string;
  readonly path: string;
  readonly node: string;
  readonly kind: string;
  readonly key: string;
  readonly targets: readonly string[];
  readonly params: Outputs;
  readonly outcome: EffectOutcome['kind'];
}

type ChildStarter = (request: EffectRequest, scope: RunScope) => Promise<NodeResult>;

export interface EffectsSimOptions {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly world: ScenarioWorld;
  readonly scripts: readonly EffectScript[];
  readonly applyToWorld: boolean;
  readonly children: ChildStarter;
}

interface Change {
  readonly device: string;
  readonly control: string;
  readonly value: JsonValue;
}

const DEVICE_KINDS: ReadonlySet<string> = new Set([
  'device.set',
  'device.set_temporarily',
  'device.toggle',
]);

const OK: NodeResult = { ok: true, value: {} };

type VariableCall = z.infer<typeof VARIABLE_PARAMS>;

type KeptCall = z.infer<typeof KEPT_PARAMS> | undefined;

function keptOf(params: Outputs): Checked<KeptCall> {
  if (!Object.hasOwn(params, 'instance')) return { ok: true, value: undefined };
  return parsed(KEPT_PARAMS, params);
}

function failure(
  errorClass: ErrorClass,
  message: string,
): { ok: false; class: ErrorClass; message: string } {
  return { ok: false, class: errorClass, message };
}

function controlOf(params: Outputs): string {
  const { control } = params;
  return typeof control === 'string' ? control : CONTROL_DEFAULT;
}

function valueFor(request: EffectRequest, current: JsonValue | undefined): Checked<JsonValue> {
  if (request.kind === 'device.toggle') {
    return { ok: true, value: typeof current === 'boolean' ? !current : true };
  }
  const { to, by } = request.params;
  if (to !== undefined) return { ok: true, value: to };
  if (typeof by === 'number' && typeof current === 'number')
    return { ok: true, value: current + by };
  return failure('Invalid', `${request.node.key} has nothing to set`);
}

export class EffectsSim {
  readonly sent: WouldSend[] = [];

  constructor(private readonly options: EffectsSimOptions) {}

  perform = async (request: EffectRequest, scope: RunScope): Promise<NodeResult> => {
    if (request.kind === RUN_AUTOMATION_KIND) {
      return this.options.children(request, scope);
    }
    const resolved = this.targetsOf(request);
    if (!resolved.ok) return resolved;
    const targets = resolved.value;
    const outcome = this.outcomeOf(request, targets);
    if (outcome.kind === 'slow') await this.pause(outcome.delayMs);
    const result = this.resultOf(request, targets, outcome, scope);
    this.sent.push({
      at: this.options.clock.now().toISOString(),
      runId: scope.runId,
      path: request.path,
      node: request.node.key,
      kind: request.kind,
      key: request.key,
      targets,
      params: request.params,
      outcome: outcome.kind,
    });
    return result;
  };

  private targetsOf(request: EffectRequest): Checked<readonly string[]> {
    const { target } = request.params;
    if (target === undefined || !DEVICE_KINDS.has(request.kind)) return { ok: true, value: [] };
    try {
      return { ok: true, value: this.options.world.deviceIds(target) };
    } catch (cause) {
      if (cause instanceof ReadFailure) return failure(cause.errorClass, cause.message);
      return failure('Invalid', `${request.node.key} has a target the home cannot resolve`);
    }
  }

  private outcomeOf(request: EffectRequest, targets: readonly string[]): EffectOutcome {
    const script = this.options.scripts.find(
      (entry) =>
        (entry.kind === undefined || entry.kind === request.kind) &&
        (entry.device === undefined || targets.includes(entry.device)),
    );
    return script?.outcome ?? { kind: 'ok' };
  }

  private pause(delayMs: number): Promise<void> {
    const { clock } = this.options;
    return new Promise((resolve) => {
      clock.at(new Date(clock.now().getTime() + delayMs), resolve);
    });
  }

  private resultOf(
    request: EffectRequest,
    targets: readonly string[],
    outcome: EffectOutcome,
    scope: RunScope,
  ): NodeResult {
    switch (outcome.kind) {
      case 'fail':
        return failure(outcome.class, outcome.message);
      case 'offline':
        return failure('Unreachable', `${request.kind} could not reach its target: offline`);
      case 'unknown':
        return failure('Unknown', `${request.kind} was sent and its result is not known`);
      case 'ok':
      case 'slow':
        return this.succeeded(request, targets, scope);
    }
  }

  private succeeded(
    request: EffectRequest,
    targets: readonly string[],
    scope: RunScope,
  ): NodeResult {
    if (request.kind === 'var.set' || request.kind === 'var.change') {
      return this.setVariable(request, scope);
    }
    if (request.kind === 'notify.ask') return { ok: true, value: { notificationId: request.key } };
    if (!DEVICE_KINDS.has(request.kind)) return OK;
    const planned = this.changesOf(request, targets);
    if (!planned.ok) return planned;
    const changes = planned.value;
    if (this.options.applyToWorld) {
      for (const change of changes) {
        this.options.world.setDevice(change.device, change.control, change.value);
      }
    }
    const last = changes.at(-1);
    return {
      ok: true,
      value: {
        ok: true,
        sent: JSON_VALUE.parse(deviceRefs(targets)),
        skipped: [],
        ...(last === undefined ? {} : { value: last.value }),
      },
    };
  }

  private changesOf(
    request: EffectRequest,
    targets: readonly string[],
  ): Checked<readonly Change[]> {
    const control = controlOf(request.params);
    const changes: Change[] = [];
    for (const device of targets) {
      const value = valueFor(request, this.options.world.deviceValue(device, control));
      if (!value.ok) return value;
      changes.push({ device, control, value: value.value });
    }
    return { ok: true, value: changes };
  }

  private setVariable(request: EffectRequest, scope: RunScope): NodeResult {
    const call = parsed(VARIABLE_PARAMS, request.params);
    if (!call.ok) return call;
    if (call.value.source !== 'automation') return OK;
    const kept = keptOf(request.params);
    if (!kept.ok) return kept;
    return this.writeVariable(scope.automationId, call.value, kept.value);
  }

  private writeVariable(automationId: string, call: VariableCall, kept: KeptCall): NodeResult {
    const { world, applyToWorld } = this.options;
    const before = world.variable(automationId, call.target, kept);
    const next = nextOf(call)(before?.value ?? kept?.initial ?? null);
    if (!next.ok) return next;
    if (applyToWorld) world.setVariable(automationId, call.target, next.value.value, kept);
    return { ok: true, value: outputs(next.value) };
  }
}
