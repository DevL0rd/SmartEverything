import { createHash } from 'node:crypto';
import {
  ApiError,
  JSON_VALUE,
  type ComputerRuntimeTarget,
  type ComputerRuntimeExecute,
} from '@smarteverything/domain';
import { z } from 'zod';

interface Binding<A> {
  readonly target: ComputerRuntimeTarget;
  readonly profileId: string;
  readonly clientId: string;
  readonly attachment: A;
  readonly signature: string;
}
const LIMIT = 10_000;
const RECORD = z.record(z.string(), z.unknown());
export function canonicalRuntimeInput(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item: unknown) => canonicalRuntimeInput(item)).join(',')}]`;
  const record = RECORD.safeParse(value);
  if (record.success)
    return `{${Object.keys(record.data)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalRuntimeInput(record.data[key])}`)
      .join(',')}}`;
  return JSON.stringify(JSON_VALUE.parse(value));
}
export class RuntimeReceipts<A> {
  private readonly bindings = new Map<string, Binding<A>>();
  authorize(
    target: ComputerRuntimeTarget,
    owner: { readonly profileId: string; readonly clientId: string },
    id: string,
    attachment: A | undefined,
  ): A {
    const known = this.bindings.get(id);
    if (
      known?.target.device_id !== target.device_id ||
      known.target.runtime !== target.runtime ||
      known.profileId !== owner.profileId ||
      known.clientId !== owner.clientId ||
      known.attachment !== attachment
    )
      throw new ApiError(
        'forbidden',
        'This receipt belongs to a different owner, runtime or attachment.',
      );
    return known.attachment;
  }
  accept(
    target: ComputerRuntimeTarget,
    owner: { readonly profileId: string; readonly clientId: string },
    request: ComputerRuntimeExecute,
    attachment: A,
  ): void {
    if (!('operation_id' in request.request) || request.request.operation_id === undefined)
      throw new ApiError('invalid_request', 'Native mutations require an operation ID.');
    const id = request.request.operation_id;
    const signature = createHash('sha256').update(canonicalRuntimeInput(request)).digest('hex');
    const previous = this.bindings.get(id);
    if (previous !== undefined) {
      this.authorize(target, owner, id, attachment);
      if (previous.signature !== signature)
        throw new ApiError(
          'conflict',
          'This operation ID already identifies different runtime input.',
        );
      return;
    }
    if (this.bindings.size >= LIMIT)
      throw new ApiError(
        'conflict',
        'The native receipt limit was reached; old IDs cannot be safely reused.',
      );
    this.bindings.set(id, { target, ...owner, attachment, signature });
  }
  profile(id: string, target: ComputerRuntimeTarget, attachment: A): string | null {
    const known = this.bindings.get(id);
    return known?.target.device_id === target.device_id &&
      known.target.runtime === target.runtime &&
      known.attachment === attachment
      ? known.profileId
      : null;
  }
}
