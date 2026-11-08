import {
  API_ERROR_CODES,
  ApiError,
  JSON_VALUE,
  pluginNodeKindId,
  pluginNodeModes,
  pluginToolName,
  type ActionMode,
  type ErrorClass,
  type PluginNode,
  type PluginOrigin,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult, Outputs } from '@smarteverything/flow/interpret/frames';
import { background, Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { limitsOf } from '../../ai-tools/plugin-turn';
import type { ToolCaller } from '../../ai-tools/hub-tool';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';
import type { Clock } from '../../clock';
import type { SignalBus } from '../../signals/bus';
import type { EventRouter } from '../../state/event-router';
import type { Store } from '../../store/store';
import { effectFailure, type EffectFailureResult } from '../effect-failure';
import type { EffectRun } from '../effects/effect-run';
import { awaitRun } from '../effects/run-abort';
import type { EffectHandler, EffectHandlers } from '../engine-v3-effects';
import { bindArgs, mapEventOutputs, mapOutputs, type BoundArgs } from './args';
import type { DriverNodes } from './driver-nodes';
import { PluginDispatchers, type Reply } from './dispatch';
import { expectedOf, resolveUntil, watchUntil, type ResolvedUntil, type UntilWatch } from './until';

export const PLUGIN_NODE_PREFIX = 'plugin.';

const log = new Logger('hub.plugin-kinds');

export interface PluginNodeDeclaration {
  readonly pluginId: string;
  readonly node: PluginNode;
}

export interface PluginNodePorts {
  readonly store: Pick<Store, 'plugins' | 'automations' | 'profiles'>;
  readonly events: Pick<EventRouter, 'record'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly signals: Pick<SignalBus, 'subscribe'>;
  readonly tools: () => Pick<ToolHub, 'check' | 'call'>;
  readonly drivers?: Pick<DriverNodes, 'declaration'>;
}

interface Who {
  readonly automationId: string;
  readonly name: string;
  readonly profileId: string;
  readonly plugin: PluginOrigin | null;
}

export function pluginNodeDeclaration(
  plugins: Pick<Store['plugins'], 'list'>,
  kindId: string,
): PluginNodeDeclaration | undefined {
  for (const row of plugins.list()) {
    const owner = { kind: 'plugin', id: row.id } as const;
    const node = row.manifest.contributes.automation.nodes.find(
      (candidate) => pluginNodeKindId(owner, candidate.id) === kindId,
    );
    if (node !== undefined) return { pluginId: row.id, node };
  }
  return undefined;
}

function whoOf(store: PluginNodePorts['store'], automationId: string): Who {
  const row = store.automations.find(automationId);
  return {
    automationId,
    name: row?.name ?? 'Automation',
    profileId: row?.author?.profile_id ?? store.profiles.first().id,
    plugin: row?.origin ?? null,
  };
}

function callerOf(who: Who): ToolCaller {
  const authority = currentExecutionAuthority();
  return {
    profileId: who.profileId,
    role: authority === undefined ? 'owner' : executionRole(authority),
    chatId: null,
    automationId: who.automationId,
    via: 'automation',
    clientId: null,
    ...limitsOf(who.plugin?.requester, who.plugin?.plugin_id),
  };
}

function failed(errorClass: ErrorClass, message: string, code?: string): EffectFailureResult {
  return { ok: false, class: errorClass, message, ...(code === undefined ? {} : { code }) };
}

function refusedBy(node: PluginNode, message: string, code: unknown): EffectFailureResult {
  if (typeof code !== 'string') return failed('Failed', message);
  const mapped = node.errors?.[code];
  if (mapped !== undefined) return failed(mapped, message, code);
  const api = API_ERROR_CODES.find((known) => known === code);
  if (api !== undefined) return { ...effectFailure(new ApiError(api, message)), message, code };
  return failed('Failed', message, code);
}

function answerOf(node: PluginNode, response: Readonly<Record<string, unknown>>): NodeResult {
  const error = response['error'];
  if (typeof error === 'string') return refusedBy(node, error, response['code']);
  const answer = JSON_VALUE.safeParse(response);
  if (!answer.success)
    return failed('Failed', 'The plugin answered with a value that is not JSON.');
  const mapped = mapOutputs(node.outputs, answer.data);
  if (!mapped.ok)
    return failed(
      'Failed',
      `The plugin answer has no ${mapped.missing.join(', ')}.`,
      'missing_output',
    );
  return { ok: true, value: mapped.outputs };
}

function argumentProblem(
  schema: Readonly<Record<string, unknown>>,
  args: BoundArgs,
): string | null {
  const checked = z.fromJSONSchema(schema).safeParse(args);
  return checked.success ? null : `The arguments are not valid: ${z.prettifyError(checked.error)}`;
}

function sentForm(args: BoundArgs, batchArg: string | undefined): BoundArgs {
  const element = batchArg === undefined ? undefined : args[batchArg];
  return batchArg === undefined || element === undefined
    ? args
    : { ...args, [batchArg]: [element] };
}

async function invokePlugin(
  tools: Pick<ToolHub, 'call'>,
  name: string,
  caller: ToolCaller,
  args: BoundArgs,
): Promise<Reply> {
  try {
    const result = await tools.call(name, args, caller);
    return { ok: true, response: result.response };
  } catch (cause) {
    return effectFailure(cause);
  }
}

interface Context {
  readonly ports: PluginNodePorts;
  readonly dispatchers: PluginDispatchers;
}

async function callPlugin(
  context: Context,
  found: PluginNodeDeclaration,
  args: BoundArgs,
  run: Pick<EffectRun, 'automationId'>,
): Promise<NodeResult> {
  const { ports, dispatchers } = context;
  try {
    const tools = ports.tools();
    const name = pluginToolName(found.pluginId, found.node.run.tool);
    const check = tools.check(name, args);
    if (!check.ok) return failed('Unreachable', check.reason, 'unavailable');
    const batchArg = found.node.batch?.arg;
    const problem = argumentProblem(check.tool.inputSchema, sentForm(args, batchArg));
    if (problem !== null) return failed('Invalid', problem, 'invalid_arguments');
    const caller = callerOf(whoOf(ports.store, run.automationId));
    const reply = await dispatchers.of(found.pluginId).submit({
      identity: JSON.stringify(caller),
      tool: name,
      args,
      batchArg,
      invoke: (sent) => invokePlugin(tools, name, caller, sent),
    });
    return reply.ok ? answerOf(found.node, reply.response) : reply;
  } catch (cause) {
    return effectFailure(cause);
  }
}

function modeFor(node: PluginNode, chosen: ActionMode | undefined): ActionMode {
  const modes = pluginNodeModes(node);
  return chosen !== undefined && modes.allowed.includes(chosen) ? chosen : modes.default;
}

interface Sent {
  readonly found: PluginNodeDeclaration;
  readonly request: Pick<EffectRequest, 'kind'>;
  readonly run: Pick<EffectRun, 'runId' | 'automationId'>;
}

function recordLate(ports: PluginNodePorts, sent: Sent, failure: EffectFailureResult): void {
  const { found, request, run } = sent;
  log.warn('plugin_node.late_failure', {
    kind: request.kind,
    plugin: found.pluginId,
    tool: found.node.run.tool,
    runId: run.runId,
    automationId: run.automationId,
    class: failure.class,
    reason: failure.message,
  });
  ports.events.record({
    deviceId: null,
    kind: 'automation_run',
    occurredAt: ports.clock.now().toISOString(),
    details: {
      automationId: run.automationId,
      name: whoOf(ports.store, run.automationId).name,
      message: `${found.node.title} failed after it was sent: ${failure.message}`,
    },
  });
}

function sendLater(ports: PluginNodePorts, sent: Sent, work: Promise<NodeResult>): void {
  background(
    work.then((result) => {
      if (!result.ok) recordLate(ports, sent, result);
    }),
    'automation.late_failure',
    { kind: sent.request.kind, runId: sent.run.runId, automationId: sent.run.automationId },
  );
}

interface Waiting {
  readonly until: ResolvedUntil;
  readonly watch: UntilWatch;
}

function waitingFor(
  ports: PluginNodePorts,
  found: PluginNodeDeclaration,
  params: Outputs,
  run: Pick<EffectRun, 'runId' | 'signal'>,
): Waiting | EffectFailureResult | undefined {
  const { until } = found.node;
  if (until === undefined) return undefined;
  const resolved = resolveUntil(until, params);
  return resolved.ok
    ? {
        until: resolved.until,
        watch: watchUntil(ports.signals, found.pluginId, resolved.until, run),
      }
    : resolved;
}

async function afterEvent(
  found: PluginNodeDeclaration,
  waiting: Waiting | undefined,
  params: Outputs,
  result: NodeResult,
): Promise<NodeResult> {
  if (waiting === undefined || !result.ok) return result;
  const matched = expectedOf(waiting.until, params, result.value);
  if (!matched.ok) return matched;
  const arrival = await waiting.watch.arrive(matched.expected);
  if (!arrival.ok) return arrival;
  const fromEvent = mapEventOutputs(found.node.outputs, arrival.data);
  if (!fromEvent.ok)
    return failed(
      'Failed',
      `The ${waiting.until.event} event has no ${fromEvent.missing.join(', ')}.`,
      'missing_output',
    );
  return { ok: true, value: { ...result.value, ...fromEvent.outputs } };
}

async function completed(
  context: Context,
  found: PluginNodeDeclaration,
  params: Outputs,
  run: EffectRun,
): Promise<NodeResult> {
  const waiting = waitingFor(context.ports, found, params, run);
  if (waiting !== undefined && !('watch' in waiting)) return waiting;
  try {
    const args = bindArgs(found.node.run.args, params);
    const result = await callPlugin(context, found, args, run);
    return await afterEvent(found, waiting, params, result);
  } finally {
    waiting?.watch.cancel();
  }
}

export function pluginNodePerformer(ports: PluginNodePorts): EffectHandler {
  const context = { ports, dispatchers: new PluginDispatchers() };
  return async (params, request, run) => {
    const found =
      pluginNodeDeclaration(ports.store.plugins, request.kind) ??
      ports.drivers?.declaration(request.kind);
    if (found === undefined)
      return failed('Unreachable', `No installed plugin declares ${request.kind}.`, 'unavailable');
    if (modeFor(found.node, request.mode) === 'fire_and_forget') {
      const args = bindArgs(found.node.run.args, params);
      sendLater(ports, { found, request, run }, callPlugin(context, found, args, run));
      return { ok: true, value: { sent: true } };
    }
    return await awaitRun(completed(context, found, params, run), run);
  };
}

export function pluginNodeEffects(ports: PluginNodePorts): EffectHandlers {
  return { [PLUGIN_NODE_PREFIX]: pluginNodePerformer(ports) };
}
