import { createHash } from 'node:crypto';
import { HARNESS_RUNTIME_REQUEST } from '@smarteverything/domain';
import type { HarnessRuntimeRequest, HarnessRuntimeReceipt } from '@smarteverything/domain';
import { HarnessAdmission } from '../host/admission';
import { HarnessRuntimeError } from '../host/errors';

export class ProcessControls {
  private readonly admission = new HarnessAdmission();
  private running = 0;
  constructor(private readonly configurationPending: () => boolean) {}
  private readonly receipts = new Map<
    string,
    { readonly signature: string; readonly result: Promise<HarnessRuntimeReceipt> }
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
      if (existing.signature !== signature)
        throw new HarnessRuntimeError(
          'operation_failed',
          'Operation identity was reused with different input.',
        );
      return existing.result;
    }
    const perform = (): Promise<HarnessRuntimeReceipt> => this.perform(() => operation(request));
    const operationResult = this.admit(request, perform);
    const result = operationResult.catch((cause: unknown) => {
      if (request.kind === 'close' || request.kind === 'permission') this.receipts.delete(id);
      throw cause;
    });
    this.receipts.set(id, { signature, result });
    return result;
  }

  private admit(
    request: HarnessRuntimeRequest,
    perform: () => Promise<HarnessRuntimeReceipt>,
  ): Promise<HarnessRuntimeReceipt> {
    if (request.kind === 'interrupt') return perform();
    if (request.kind !== 'configuration_prepare')
      return this.admission
        .run(() => Promise.resolve({ result: perform() }))
        .then(({ result }) => result);
    this.assertPreparationAvailable();
    return this.admission.run(() => {
      this.assertPreparationAvailable();
      return perform();
    });
  }

  private assertPreparationAvailable(): void {
    if (this.configurationPending() && this.running > 0)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'Shared configuration is waiting for admitted native control to settle.',
      );
  }

  private async perform(
    operation: () => Promise<HarnessRuntimeReceipt>,
  ): Promise<HarnessRuntimeReceipt> {
    this.running += 1;
    try {
      return await operation();
    } finally {
      this.running -= 1;
    }
  }

  shutdown(operation: () => Promise<void>): Promise<void> {
    return this.admission.shutdown(operation);
  }
}
