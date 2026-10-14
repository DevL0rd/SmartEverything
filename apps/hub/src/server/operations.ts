import {
  currentExecutionAuthorities,
  executionRole,
  validateExecutionAuthority,
  withExecutionAuthority,
} from '../assistant/execution-authority';
import { API_ENDPOINTS } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { ApiError, type EndpointName } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { operationRefusal } from '../ai-tools/plugin-turn';
import type { Caller } from './auth';
import { issuesOf } from './errors';
import type { Bound } from './router';

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
  private executionAdmission:
    ((name: string, args: Readonly<Record<string, unknown>>) => void) | null = null;
  bindExecutionAdmission(
    admit: (name: string, args: Readonly<Record<string, unknown>>) => void,
  ): void {
    this.executionAdmission = admit;
  }
  private store: Store | null = null;
  bindServiceAuthority(store: Store): void {
    this.store = store;
  }
  private table: ReadonlyMap<string, Bound> | null = null;

  constructor(private readonly log: Logger) {}

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
    this.executionAdmission?.(name, {
      params: input.params ?? {},
      body: input.body ?? null,
      query: input.query ?? {},
    });
    if (caller.kind === 'service') this.admitService(name, caller);
    this.admitInherited(name);
    const refusal =
      (caller.kind === 'client' || caller.kind === 'service') &&
      caller.pluginRequester !== undefined
        ? operationRefusal(name)
        : null;
    if (refusal !== null) {
      throw refusal;
    }
  }
  private admitInherited(name: EndpointName): void {
    if (this.store !== null)
      for (const scope of currentExecutionAuthorities()) {
        if (
          API_ENDPOINTS[name].access !== 'member' &&
          API_ENDPOINTS[name].access !== 'public' &&
          executionRole(this.store, scope) !== 'owner'
        )
          throw new ApiError(
            'forbidden',
            'Inherited authority does not grant owner/device operations.',
          );
      }
  }
  private admitService(name: EndpointName, caller: Extract<Caller, { kind: 'service' }>): void {
    if (this.store === null)
      throw new ApiError('forbidden', 'Internal service authority is not bound.');
    validateExecutionAuthority(this.store, caller.authority);
    if (API_ENDPOINTS[name].access !== 'member' && API_ENDPOINTS[name].access !== 'public')
      throw new ApiError(
        'forbidden',
        'This initiating service grant does not authorize owner/device access.',
      );
  }
  run(name: EndpointName, caller: Caller, input: OperationInput): Promise<unknown> {
    this.admit(name, caller, input);
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
    return caller.kind === 'service' ? withExecutionAuthority(caller.authority, run) : run();
  }
}
