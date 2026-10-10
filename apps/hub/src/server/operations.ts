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

  run(name: EndpointName, caller: Caller, input: OperationInput): Promise<unknown> {
    const refusal =
      caller.kind === 'client' && caller.pluginRequester !== undefined
        ? operationRefusal(name)
        : null;
    if (refusal !== null) {
      return Promise.reject(refusal);
    }
    return this.bound(name).run(
      caller,
      {
        params: input.params ?? {},
        query: queryOf(input.query ?? {}),
        body: input.body,
        remote: 'mcp',
      },
      this.log,
    );
  }
}
