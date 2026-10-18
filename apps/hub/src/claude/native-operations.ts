import { createHash, randomUUID } from 'node:crypto';
import {
  JSON_VALUE,
  type ClaudeOperation,
  type ComputerAiExecute,
  type ComputerAiRequest,
  type ComputerAiReply,
} from '@smarteverything/domain';
import {
  ClaudeControlTimeoutError,
  ClaudeControlUncertainError,
  ClaudeNotReadyError,
} from './errors';
import { messageOf } from '@smarteverything/logging';

export type NativeOperationRequest = Extract<
  ComputerAiExecute,
  {
    operation: 'control' | 'start' | 'native_tools_call';
  }
>;

export function isNativeOperation(request: ComputerAiRequest): request is NativeOperationRequest {
  return (
    request.operation === 'control' ||
    request.operation === 'start' ||
    request.operation === 'native_tools_call'
  );
}

interface Receipt {
  readonly signature: string;
  readonly operation: ClaudeOperation;
}

interface Signature {
  readonly signature: string;
  readonly operation: ClaudeOperation['operation'];
}

export class NativeOperations {
  private readonly receipts = new Map<string, Receipt>();
  private readonly signatures = new Map<string, Signature>();
  constructor(private readonly changed: (operation: ClaudeOperation) => void) {}

  read(id: string): ClaudeOperation {
    const receipt = this.receipts.get(id);
    if (receipt !== undefined) return receipt.operation;
    const signature = this.signatures.get(id);
    if (signature === undefined)
      throw new ClaudeNotReadyError(
        'native operation',
        'This runtime no longer owns the receipt. Its outcome is uncertain; inspect the native session before submitting another action.',
      );
    return {
      id,
      operation: signature.operation,
      state: 'uncertain',
      value: null,
      error:
        'The retained result expired. This operation ID will not execute again; inspect the native session before submitting another action.',
    };
  }

  stop(): void {
    for (const [id, receipt] of this.receipts) {
      if (receipt.operation.state !== 'pending') continue;
      const operation: ClaudeOperation = {
        ...receipt.operation,
        state: 'uncertain',
        error:
          'The runtime stopped before confirming completion. A submitted native tool may still finish; inspect the native session before submitting another action.',
      };
      this.receipts.set(id, { ...receipt, operation });
      this.changed(operation);
    }
  }

  async execute(
    request: NativeOperationRequest,
    run: () => Promise<ComputerAiReply>,
  ): Promise<ComputerAiReply> {
    const id = request.operation_id ?? randomUUID();
    const { operation_id: _operationId, ...input } = request;
    const signature = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous = this.signatures.get(id);
    if (previous !== undefined) {
      if (previous.signature !== signature)
        throw new ClaudeNotReadyError(
          request.operation,
          'The operation ID was reused with different input.',
        );
      return { operation: request.operation, value: { native_operation: this.read(id) } };
    }
    this.reserve();
    const receipt: Receipt = {
      signature,
      operation: { id, operation: request.operation, state: 'pending', value: null, error: null },
    };
    this.receipts.set(id, receipt);
    this.signatures.set(id, { signature, operation: request.operation });
    const executing = this.complete(id, run);
    let timer: NodeJS.Timeout | undefined;
    const early = await Promise.race([
      executing,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
        }, 500);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    return early ?? { operation: request.operation, value: { native_operation: this.read(id) } };
  }

  private async complete(
    id: string,
    run: () => Promise<ComputerAiReply>,
  ): Promise<ComputerAiReply | null> {
    const receipt = this.receipts.get(id);
    if (receipt === undefined)
      throw new ClaudeNotReadyError('native operation', 'The receipt is missing.');
    try {
      const reply = await run();
      const operation: ClaudeOperation = {
        ...receipt.operation,
        state: 'completed',
        value: retainedValue(reply.value),
      };
      this.receipts.set(id, { ...receipt, operation });
      this.changed(operation);
      return reply;
    } catch (cause) {
      const operation: ClaudeOperation = {
        ...receipt.operation,
        state:
          cause instanceof ClaudeControlTimeoutError || cause instanceof ClaudeControlUncertainError
            ? 'uncertain'
            : 'failed',
        error: messageOf(cause).slice(0, 2000),
      };
      this.receipts.set(id, { ...receipt, operation });
      this.changed(operation);
      return null;
    }
  }

  private reserve(): void {
    if (this.signatures.size >= 10_000)
      throw new ClaudeNotReadyError(
        'native operation',
        'This runtime reached its operation ID retention limit; inspect existing work and restart the runtime before submitting more actions.',
      );
    if (this.receipts.size < 200) return;
    const oldest = [...this.receipts].find(
      ([, receipt]) =>
        receipt.operation.state === 'completed' || receipt.operation.state === 'failed',
    );
    if (oldest === undefined)
      throw new ClaudeNotReadyError(
        'native operation',
        'Read and resolve existing pending operations before starting more work.',
      );
    this.receipts.delete(oldest[0]);
  }
}

function retainedValue(value: unknown): ClaudeOperation['value'] {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > 64_000)
    return {
      omitted: true,
      reason:
        'The operation completed. Its response exceeds the receipt retention limit; inspect its native session output.',
    };
  return JSON_VALUE.parse(value);
}
