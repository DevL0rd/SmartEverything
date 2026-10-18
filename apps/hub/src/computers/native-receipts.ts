import { createHash } from 'node:crypto';
import { ApiError, type ComputerAiRequest } from '@smarteverything/domain';
import { trimOldest } from '../trim-oldest';
import { canonicalRuntimeInput } from './runtime-receipts';

export type NativeReceiptRequest = Extract<
  ComputerAiRequest,
  { operation: 'native_operation' | 'control' | 'start' | 'native_tools_call' }
>;
type Mutation = Exclude<NativeReceiptRequest, { operation: 'native_operation' }>;
interface Binding<A> {
  readonly deviceId: string;
  readonly profileId: string;
  readonly clientId: string;
  readonly attachment: A;
  readonly signature: string;
}
const KEPT_RECEIPT_BINDINGS = 10_000;

export class NativeReceipts<A> {
  private readonly bindings = new Map<string, Binding<A>>();

  authorize(
    deviceId: string,
    owner: { readonly profileId: string; readonly clientId: string },
    id: string,
    attachment: A | undefined,
  ): A {
    const known = this.bindings.get(id);
    if (
      known?.deviceId !== deviceId ||
      known.profileId !== owner.profileId ||
      known.clientId !== owner.clientId ||
      known.attachment !== attachment
    )
      throw new ApiError(
        'forbidden',
        'This receipt is not bound to this owner and computer connection.',
      );
    return known.attachment;
  }

  accept(
    deviceId: string,
    owner: { readonly profileId: string; readonly clientId: string },
    request: Mutation,
    attachment: A,
  ): void {
    const id = request.operation_id;
    if (id === undefined)
      throw new ApiError(
        'invalid_request',
        'Native operation submission requires a correlation ID.',
      );
    const signature = createHash('sha256').update(canonicalRuntimeInput(request)).digest('hex');
    const previous = this.bindings.get(id);
    if (previous !== undefined) {
      this.authorize(deviceId, owner, id, attachment);
      if (previous.signature !== signature)
        throw new ApiError(
          'conflict',
          'This native operation ID already belongs to different input.',
        );
      return;
    }
    this.bindings.set(id, { deviceId, ...owner, attachment, signature });
    trimOldest(this.bindings, KEPT_RECEIPT_BINDINGS);
  }

  profile(id: string, deviceId: string, attachment: A | undefined): string | null {
    const known = this.bindings.get(id);
    if (known?.deviceId !== deviceId || known.attachment !== attachment) return null;
    return known.profileId;
  }
}
