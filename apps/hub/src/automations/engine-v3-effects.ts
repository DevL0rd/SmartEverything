import { FLOW_TYPE, JSON_VALUE } from '@smarteverything/domain';
import type { DeviceEffectOperation, JsonValue } from '@smarteverything/domain';
import type {
  Checked,
  EffectRequest,
  NodeResult,
  Outputs,
} from '@smarteverything/flow/interpret/frames';
import { changeVariable } from '@smarteverything/flow/nodes/state/var-change';
import { z } from 'zod';
import type { Store } from '../store/store';
import type {
  AutomationOwnedValuesRepository,
  OwnedValueContent,
} from '../store/repositories/automation-owned-values';
import type { DeviceSetter } from './effects/device-set';
import type { TemporaryDeviceChanges } from './effects/device-temporary';
import type { DeviceToggler } from './effects/device-toggle';
import type { EffectRun } from './effects/effect-run';
import type { CommandIssuer } from './issue-commands';
import { sceneHandler, toggleHandler } from './engine-v3-device-effects';
import { applyValueChange } from './effects/value-ops';
import type { HttpEffects, HttpRequest } from './effects/http';
import { TARGET_VALUE } from './world-v3/refs';
import { stampOf } from './effects/command-metadata';
import { effectFailure } from './effect-failure';
import type { KeptData } from './world-v3/kept-data';

export type EffectHandler = (
  params: Outputs,
  request: EffectRequest,
  run: EffectRun,
) => Promise<NodeResult>;

export type EffectHandlers = Readonly<Record<string, EffectHandler>>;

export interface EffectPorts {
  readonly setter: Pick<DeviceSetter, 'set'>;
  readonly temporary?: Pick<TemporaryDeviceChanges, 'run'> | undefined;
  readonly http: Pick<HttpEffects, 'request'>;
  readonly toggler: Pick<DeviceToggler, 'toggle'>;
  readonly issuer: Pick<CommandIssuer, 'issue'>;
  readonly store: Pick<Store, 'automationValues' | 'scenes'>;
  readonly owned: Pick<AutomationOwnedValuesRepository, 'list' | 'write'>;
  readonly kept: Pick<KeptData, 'read' | 'write'>;
  readonly extra: EffectHandlers;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;

const SET_PARAMS = z.object({
  target: TARGET_VALUE,
  control: z.string().min(1),
  to: JSON_VALUE.optional(),
  by: z.number().optional(),
  percent: z.boolean().default(false),
  requireAll: z.boolean().default(false),
});

const TEMPORARY_PARAMS = z.object({
  target: TARGET_VALUE,
  control: z.string().min(1),
  to: JSON_VALUE.optional(),
  by: z.number().optional(),
  duration: z.number().int().min(0),
  priority: z.number().int().default(0),
  holdWhile: z.boolean().optional(),
});

const HTTP_PARAMS = z.object({
  url: z.string(),
  method: z.enum(METHODS).default('GET'),
  headers: z.record(z.string(), z.string()).default({}),
  query: z.record(z.string(), z.string()).default({}),
  body: JSON_VALUE.optional(),
  bodyKind: z.enum(['json', 'form', 'text']).default('json'),
  auth: z
    .object({
      secret: z.string(),
      scheme: z.enum(['bearer', 'basic', 'header', 'query']),
      name: z.string().optional(),
    })
    .optional(),
  timeout: z.number().default(30_000),
  followRedirects: z.boolean().default(true),
  responseKind: z.enum(['auto', 'json', 'text']).default('auto'),
  acceptStatus: z.array(z.number()).default([]),
  allowLocalNetwork: z.boolean().default(false),
});

export const VARIABLE_PARAMS = z.object({
  source: z.enum(['run', 'automation', 'home']),
  target: z.string().min(1),
  to: JSON_VALUE.optional(),
  change: z
    .object({
      op: z.string(),
      edge: z.enum(['wrap', 'clamp']),
      field: z.string().optional(),
      steps: z.array(z.json()).optional(),
      amount: z.json().optional(),
    })
    .optional(),
});

export const KEPT_PARAMS = z.object({
  instance: z.string().min(1),
  type: FLOW_TYPE,
  initial: JSON_VALUE,
});

export function invalid(message: string): Extract<Checked<never>, { ok: false }> {
  return { ok: false, class: 'Invalid', message };
}

export function parsed<T>(schema: z.ZodType<T>, params: Outputs): Checked<T> {
  const result = schema.safeParse(params);
  return result.success ? { ok: true, value: result.data } : invalid(z.prettifyError(result.error));
}

export function outputs(value: unknown): Outputs {
  return z.record(z.string(), JSON_VALUE).parse(JSON.parse(JSON.stringify(value)));
}

function deviceSet(ports: EffectPorts): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(SET_PARAMS, params);
    if (!checked.ok) return checked;
    const set = checked.value;
    const { to } = set;
    if (to === undefined) {
      return invalid('Changing a device by an amount is not available yet; give the value to set.');
    }
    try {
      const sent = await ports.setter.set(
        {
          target: set.target,
          control: set.control,
          value: () => to,
          percent: set.percent,
          serialised: true,
          requireAll: set.requireAll,
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: outputs({ ok: true, ...sent, value: to }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function temporaryOperation(
  change: z.infer<typeof TEMPORARY_PARAMS>,
): Checked<DeviceEffectOperation> {
  if (change.to !== undefined) return { ok: true, value: { type: 'set', value: change.to } };
  if (change.by !== undefined) return { ok: true, value: { type: 'add', value: change.by } };
  return invalid('A temporary change needs a value or an amount.');
}

function deviceTemporary(temporary: Pick<TemporaryDeviceChanges, 'run'>): EffectHandler {
  return async (params, request, run) => {
    const checked = parsed(TEMPORARY_PARAMS, params);
    if (!checked.ok) return checked;
    const change = checked.value;
    const operation = temporaryOperation(change);
    if (!operation.ok) return operation;
    try {
      const note = await temporary.run(
        {
          target: change.target,
          control: change.control,
          operation: operation.value,
          durationMs: change.duration,
          priority: change.priority,
          holds: () => change.holdWhile !== false,
          clockMinutes: [],
          nodeId: request.node.id,
          at: stampOf(request.path),
        },
        run,
      );
      return { ok: true, value: outputs({ ok: true, note }) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function httpRequest(ports: EffectPorts): EffectHandler {
  return async (params, _request, run) => {
    const checked = parsed(HTTP_PARAMS, params);
    if (!checked.ok) return checked;
    const call = checked.value;
    const request: HttpRequest = {
      url: call.url,
      method: call.method,
      headers: call.headers,
      query: call.query,
      body: call.body,
      bodyKind: call.bodyKind,
      auth:
        call.auth === undefined
          ? undefined
          : {
              secret: call.auth.secret,
              scheme: call.auth.scheme,
              ...(call.auth.name === undefined ? {} : { name: call.auth.name }),
            },
      timeoutMs: call.timeout,
      followRedirects: call.followRedirects,
      responseKind: call.responseKind,
      acceptStatus: call.acceptStatus,
      allowLocalNetwork: call.allowLocalNetwork,
    };
    try {
      return { ok: true, value: outputs(await ports.http.request(request, run)) };
    } catch (cause) {
      return effectFailure(cause);
    }
  };
}

function contentWith(content: OwnedValueContent, value: JsonValue): OwnedValueContent | undefined {
  if (content.kind === 'typed') return { ...content, value };
  if (content.kind === 'text') return typeof value === 'string' ? { ...content, value } : undefined;
  return typeof value === 'string' || value === null ? { ...content, value } : undefined;
}

function persistent(ports: EffectPorts, run: EffectRun, name: string, next: Next): NodeResult {
  const row = ports.owned.list(run.automationId).find((entry) => entry.content.name === name);
  if (row === undefined) {
    return { ok: false, class: 'NotFound', message: `The automation has no variable "${name}"` };
  }
  const before: JsonValue = row.content.value;
  const result = next(before);
  if (!result.ok) return result;
  const content = contentWith(row.content, result.value.value);
  if (content === undefined) {
    return invalid(`The variable "${name}" cannot hold ${JSON.stringify(result.value.value)}`);
  }
  ports.owned.write(run.automationId, row.id, content, row.revision);
  return { ok: true, value: outputs(result.value) };
}

function keptVariable(
  ports: EffectPorts,
  run: EffectRun,
  call: z.infer<typeof VARIABLE_PARAMS>,
  kept: z.infer<typeof KEPT_PARAMS>,
): NodeResult {
  const { instance, type } = kept;
  const key = { automationId: run.automationId, instance, name: call.target, type };
  const result = nextOf(call)(ports.kept.read(key)?.value ?? kept.initial);
  if (!result.ok) return result;
  ports.kept.write(key, result.value.value);
  return { ok: true, value: outputs(result.value) };
}

interface Changed {
  readonly value: JsonValue;
  readonly previous: JsonValue;
  readonly wrapped?: boolean;
}

type Next = (before: JsonValue) => Checked<Changed>;

export function nextOf(params: z.infer<typeof VARIABLE_PARAMS>): Next {
  return (before) => {
    if (params.change === undefined) {
      return { ok: true, value: { value: params.to ?? null, previous: before } };
    }
    const { op, edge, field, steps, amount } = params.change;
    const changed = changeVariable(before, {
      op: z
        .enum([
          'toggle',
          'add',
          'subtract',
          'multiply',
          'next',
          'previous',
          'append',
          'remove',
          'set_field',
        ])
        .parse(op),
      edge,
      ...(field === undefined ? {} : { field }),
      ...(steps === undefined ? {} : { steps }),
      ...(amount === undefined ? {} : { amount }),
    });
    if (!changed.ok) return { ok: false, class: changed.errorClass, message: changed.message };
    return {
      ok: true,
      value: { value: changed.value, previous: before, wrapped: changed.wrapped },
    };
  };
}

function homeValue(ports: EffectPorts, params: z.infer<typeof VARIABLE_PARAMS>): NodeResult {
  const op = params.change === undefined ? 'set' : params.change.op;
  const amount = params.change === undefined ? params.to : params.change.amount;
  const before = ports.store.automationValues.byId(params.target).content.value;
  const row = applyValueChange(ports.store, { valueId: params.target, op, amount });
  return {
    ok: true,
    value: outputs({ value: row.content.value, previous: before, wrapped: false }),
  };
}

function variable(ports: EffectPorts): EffectHandler {
  return (params, _request, run) => {
    const checked = parsed(VARIABLE_PARAMS, params);
    if (!checked.ok) return Promise.resolve(checked);
    const call = checked.value;
    try {
      if (call.source === 'home') return Promise.resolve(homeValue(ports, call));
      if (Object.hasOwn(params, 'instance')) {
        const kept = parsed(KEPT_PARAMS, params);
        return Promise.resolve(kept.ok ? keptVariable(ports, run, call, kept.value) : kept);
      }
      return Promise.resolve(persistent(ports, run, call.target, nextOf(call)));
    } catch (cause) {
      return Promise.resolve(effectFailure(cause));
    }
  };
}

export function effectHandlers(ports: EffectPorts): EffectHandlers {
  return {
    'device.set': deviceSet(ports),
    ...(ports.temporary === undefined
      ? {}
      : { 'device.set_temporarily': deviceTemporary(ports.temporary) }),
    'http.request': httpRequest(ports),
    'var.set': variable(ports),
    'var.change': variable(ports),
    'device.toggle': toggleHandler(ports.toggler),
    'scene.run': sceneHandler(ports.store, ports.issuer),
    ...ports.extra,
  };
}

export type Performer = (request: EffectRequest, run: EffectRun) => Promise<NodeResult>;

export function performer(handlers: EffectHandlers): Performer {
  return async (request, run) => {
    const handler = handlers[request.kind];
    if (handler === undefined) {
      return {
        ok: false,
        class: 'NotFound',
        message: `Nothing in this hub performs ${request.kind} yet`,
      };
    }
    return await handler(request.params, request, run);
  };
}
