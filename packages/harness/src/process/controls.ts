import { createHash } from 'node:crypto';
import { HARNESS_RUNTIME_REQUEST } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HarnessRuntimeRequest, HarnessRuntimeReceipt } from '@smarteverything/domain';
import { HarnessAdmission } from '../host/admission';
import { HarnessRuntimeError } from '../host/errors';

const log = new Logger('hub.harness');

export class ProcessControls {
  private readonly admission = new HarnessAdmission();
  private readonly receipts = new Map<
    string,
    {
      readonly signature: string;
      readonly session: string;
      readonly result: Promise<HarnessRuntimeReceipt>;
    }
  >();

  execute(
    id: string,
    raw: HarnessRuntimeRequest,
    operation: (request: HarnessRuntimeRequest) => Promise<HarnessRuntimeReceipt>,
  ): Promise<HarnessRuntimeReceipt> {
    const request = HARNESS_RUNTIME_REQUEST.parse(raw);
    const signature = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const existing = this.receipts.get(id);
    if (existing !== undefined) {
      if (existing.signature !== signature) {
        log.warn('control.identity_reused', {
          request_id: id,
          kind: raw.kind,
          session_id: existing.session,
        });
        throw new HarnessRuntimeError(
          'operation_failed',
          'Operation identity was reused with different input.',
        );
      }
      log.debug('control.replayed', {
        request_id: id,
        kind: raw.kind,
        session_id: existing.session,
      });
      return existing.result;
    }
    const perform = (): Promise<HarnessRuntimeReceipt> => operation(request);
    const operationResult = this.admit(request, perform);
    const session = sessionOf(request);
    const result = operationResult.then(
      (receipt) => {
        if (request.kind === 'close') this.forgetSession(session, id);
        return receipt;
      },
      (cause: unknown): never => {
        log.debug('control.receipt_dropped', {
          request_id: id,
          kind: request.kind,
          session_id: session,
        });
        this.receipts.delete(id);
        throw cause;
      },
    );
    this.receipts.set(id, { signature, session, result });
    return result;
  }

  private forgetSession(session: string, keep: string): void {
    for (const [id, receipt] of this.receipts)
      if (receipt.session === session && id !== keep) this.receipts.delete(id);
  }

  private admit(
    request: HarnessRuntimeRequest,
    perform: () => Promise<HarnessRuntimeReceipt>,
  ): Promise<HarnessRuntimeReceipt> {
    if (request.kind === 'interrupt') return perform();
    return this.admission
      .run(() => Promise.resolve({ result: perform() }))
      .then(({ result }) => result);
  }

  shutdown(operation: () => Promise<void>): Promise<void> {
    return this.admission.shutdown(operation);
  }
}

function sessionOf(request: HarnessRuntimeRequest): string {
  return request.kind === 'open' ? request.claim.session_id : request.session_id;
}
