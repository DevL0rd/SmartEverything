import { newOperationId, operationIdOfCall } from '../call-identity';

const NAMESPACE = 'smarteverything.image-operation';

export function imageOperationIdOfCall(callId: string): string {
  return operationIdOfCall(NAMESPACE, callId);
}

export function newImageOperationId(callId: string | undefined): string {
  return newOperationId(NAMESPACE, callId);
}
