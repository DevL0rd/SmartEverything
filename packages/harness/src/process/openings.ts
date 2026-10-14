import { HarnessRuntimeError } from '../host/errors';
import type { HarnessRuntimeRequest, HarnessRuntimeReceipt } from '@smarteverything/domain';
type Open = Extract<HarnessRuntimeRequest, { kind: 'open' }>;
export class ProcessOpenings {
  private readonly pending = new Map<
    string,
    { readonly signature: string; readonly result: Promise<HarnessRuntimeReceipt> }
  >();
  run(
    id: string,
    input: Open,
    open: () => Promise<HarnessRuntimeReceipt>,
  ): Promise<HarnessRuntimeReceipt> {
    const signature = openIdentity(input);
    const previous = this.pending.get(input.claim.session_id);
    if (previous !== undefined) {
      if (previous.signature !== signature)
        throw new HarnessRuntimeError(
          'operation_failed',
          'A competing open changed the admitted native request.',
        );
      return previous.result.then((receipt) => ({ ...receipt, operation_id: id }));
    }
    const result = Promise.resolve()
      .then(open)
      .finally(() => {
        this.pending.delete(input.claim.session_id);
      });
    this.pending.set(input.claim.session_id, { signature, result });
    return result;
  }
}

export function openIdentity(input: Open): string {
  const { expires_at: _expiresAt, ...claim } = input.claim;
  return JSON.stringify({ ...input, claim });
}
