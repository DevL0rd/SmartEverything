import {
  currentExecutionAuthority,
  hubOriginated,
  withExecutionAuthority,
} from '../assistant/turn-authority';
import { HubLocalBoundary } from '../harness/hub-local-boundary';
import type { Store } from '../store/store';
import { ApiError, type EndpointName } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { operationRefusal } from '../ai-tools/plugin-turn';
import type { Caller } from './auth';
import { admitConfined } from './confinement';
import { assertOwnerRoute } from './owner-route';
import { assertScopeRoute } from './person-scope';
import { issuesOf } from './errors';
import type { Bound } from './router';
import { messageOf } from '@smarteverything/logging';

export interface OperationInput {
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

class OperationsNotReadyError extends Error {
  override readonly name = 'OperationsNotReadyError';

  constructor() {
    super('The operations were called before the server attached its route table.');
  }
}

function queryText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(',');
  }
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function queryOf(query: Readonly<Record<string, unknown>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, queryText(value)]),
  );
}

export class Operations {
  private readonly boundary: HubLocalBoundary;
  private table: ReadonlyMap<string, Bound> | null = null;

  constructor(
    private readonly log: Logger,
    private readonly store: Store,
  ) {
    this.boundary = new HubLocalBoundary(store);
  }

  attach(table: Readonly<Record<string, Bound | undefined>>): void {
    this.table = new Map(
      Object.entries(table).flatMap(([name, bound]) =>
        bound === undefined ? [] : [[name, bound] as const],
      ),
    );
  }

  bound(name: EndpointName): Bound {
    if (this.table === null) {
      throw new OperationsNotReadyError();
    }
    const found = this.table.get(name);
    if (found === undefined) {
      throw new ApiError('not_found', `This server does not implement the operation ${name}.`);
    }
    return found;
  }

  check(name: EndpointName, input: OperationInput): string | null {
    const { endpoint } = this.bound(name);
    const parts = [
      ['path', endpoint.params.safeParse(input.params ?? {})],
      ['query', endpoint.query.safeParse(queryOf(input.query ?? {}))],
      ['body', endpoint.body.safeParse(input.body)],
    ] as const;
    const failed = parts.find(([, result]) => !result.success);
    if (failed === undefined || failed[1].success) {
      return null;
    }
    return `The ${failed[0]} is not valid: ${issuesOf(failed[1].error)}`;
  }

  private admit(name: EndpointName, caller: Caller, input: OperationInput): void {
    const authority = caller.kind === 'service' ? caller.authority : currentExecutionAuthority();
    if (hubOriginated(authority)) {
      const refusal = withExecutionAuthority(authority, () =>
        this.boundary.refusal('call_operation', {
          operation: name,
          arguments: {
            params: input.params ?? {},
            body: input.body ?? null,
            query: input.query ?? {},
          },
        }),
      );
      if (refusal !== undefined) throw new ApiError('forbidden', refusal);
    }
    assertOwnerRoute(this.store, caller, this.bound(name).endpoint);
    assertScopeRoute(this.store, caller, this.bound(name).endpoint, input.params ?? {});
    admitConfined(this.store, name, caller, input);
    const refusal =
      (caller.kind === 'client' || caller.kind === 'service') &&
      caller.pluginRequester !== undefined
        ? operationRefusal(name)
        : null;
    if (refusal !== null) {
      throw refusal;
    }
  }
  run(name: EndpointName, caller: Caller, input: OperationInput): Promise<unknown> {
    const startedAt = performance.now();
    const who = {
      operation: name,
      callerKind: caller.kind,
      clientId: caller.kind === 'client' ? caller.client.id : null,
    };
    try {
      this.admit(name, caller, input);
    } catch (cause) {
      this.log.warn('operation.refused', {
        ...who,
        errorName: cause instanceof Error ? cause.name : 'unknown',
        reason: messageOf(cause).slice(0, 200),
      });
      throw cause;
    }
    const run = (): Promise<unknown> =>
      this.bound(name).run(
        caller,
        {
          params: input.params ?? {},
          query: queryOf(input.query ?? {}),
          body: input.body,
          remote: 'mcp',
        },
        this.log,
      );
    const running =
      caller.kind === 'service' ? withExecutionAuthority(caller.authority, run) : run();
    return running.then(
      (value) => {
        this.log.debug('operation.finished', () => ({
          ...who,
          durationMs: Math.round(performance.now() - startedAt),
        }));
        return value;
      },
      (cause: unknown) => {
        this.log.warn('operation.failed', {
          ...who,
          durationMs: Math.round(performance.now() - startedAt),
          errorName: cause instanceof Error ? cause.name : 'unknown',
          reason: messageOf(cause).slice(0, 200),
        });
        throw cause;
      },
    );
  }
}
