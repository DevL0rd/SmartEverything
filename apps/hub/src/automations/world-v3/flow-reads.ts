import type {
  Checked,
  Evaluated,
  NodeResult,
  ReadPort,
  ReadRequest,
} from '@smarteverything/flow/interpret/frames';
import { READ_PENDING, type ReadPending } from '@smarteverything/flow/interpret/read-pending';
import type { WorldReadDeps } from './deps';
import { ReadFailure, keptOf, type ReadScope } from './read-port';
import { ReadNotFetchedError, StepReads } from './step-reads';
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
  const fetching = new StepReads(deps.store.host, deps.clock);
  const scopeOf = (request: ReadRequest): ReadScope => {
    const memory = deps.memory.recall(binding.automationId, memorySlot(request));
    return {
      automationId: binding.automationId,
      nodeId: request.node.id,
      nodeKey: request.node.key,
      seed: request.seed,
      activation: request.activation,
      kept: keptOf(request.kept),
      fetch: fetching.fetch,
      now: fetching.now,
      ...(memory === undefined ? {} : { memory }),
      ...(binding.deviceTest === undefined ? {} : { deviceTest: binding.deviceTest }),
    };
  };
  return {
    node: (request): NodeResult | ReadPending => {
      try {
        return attempt(() => {
          const result = world.read(request.kind, request.inputs, scopeOf(request));
          if (result.memory !== undefined) {
            deps.memory.keep(binding.automationId, memorySlot(request), result.memory);
          }
          return result.outputs;
        });
      } catch (cause) {
        if (cause instanceof ReadNotFetchedError) return READ_PENDING;
        throw cause;
      }
    },
    variable: (name, kept): Evaluated => ({
      ok: true,
      value: deps.persistent.read(binding.automationId, name, kept)?.value,
    }),
  };
}
