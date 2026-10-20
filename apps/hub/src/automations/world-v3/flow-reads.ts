import type {
  Checked,
  Evaluated,
  NodeResult,
  ReadPort,
  ReadRequest,
} from '@smarteverything/flow/interpret/frames';
import type { WorldReadDeps } from './deps';
import { ReadFailure, keptOf, type ReadScope } from './read-port';
import { createWorldReads } from './world-reads';

export interface ReadBinding {
  readonly automationId: string;
  readonly deviceTest?: (deviceId: string) => boolean;
}

function failed(cause: unknown): Checked<never> {
  if (cause instanceof ReadFailure)
    return { ok: false, class: cause.errorClass, message: cause.message };
  throw cause;
}

function attempt<T>(run: () => T): Checked<T> {
  try {
    return { ok: true, value: run() };
  } catch (cause) {
    return failed(cause);
  }
}

export function memorySlot(request: Pick<ReadRequest, 'instance' | 'node'>): string {
  return request.instance === '' ? request.node.id : `${request.instance}/${request.node.id}`;
}

export function createFlowReads(deps: WorldReadDeps, binding: ReadBinding): ReadPort {
  const world = createWorldReads(deps);
  const scopeOf = (request: ReadRequest): ReadScope => {
    const memory = deps.memory.recall(binding.automationId, memorySlot(request));
    return {
      automationId: binding.automationId,
      nodeId: request.node.id,
      nodeKey: request.node.key,
      seed: request.seed,
      activation: request.activation,
      kept: keptOf(request.kept),
      ...(memory === undefined ? {} : { memory }),
      ...(binding.deviceTest === undefined ? {} : { deviceTest: binding.deviceTest }),
    };
  };
  return {
    node: (request): NodeResult =>
      attempt(() => {
        const result = world.read(request.kind, request.inputs, scopeOf(request));
        if (result.memory !== undefined) {
          deps.memory.keep(binding.automationId, memorySlot(request), result.memory);
        }
        return result.outputs;
      }),
    variable: (name, kept): Evaluated => ({
      ok: true,
      value: deps.persistent.read(binding.automationId, name, kept)?.value,
    }),
  };
}
