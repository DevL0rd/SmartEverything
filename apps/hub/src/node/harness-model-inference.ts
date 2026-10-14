import WebSocket from 'ws';
import { NODE_HARNESS_FRAME, SUBSCRIPTION_INFERENCE_MAX_BYTES } from '@smarteverything/domain';
import type { HubHarnessControl, SubscriptionInferenceResult } from '@smarteverything/domain';
import type { ComputerHarness } from '@smarteverything/harness/process';
import { NodeHarnessError } from './harness-binding';

type SupplierInferenceControl = Extract<
  HubHarnessControl,
  {
    type:
      | 'harness_subscription_inference'
      | 'harness_subscription_inference_credit'
      | 'harness_subscription_inference_cancel';
  }
>;
export function isSupplierInferenceControl(
  frame: HubHarnessControl,
): frame is SupplierInferenceControl {
  return (
    frame.type === 'harness_subscription_inference' ||
    frame.type === 'harness_subscription_inference_credit' ||
    frame.type === 'harness_subscription_inference_cancel'
  );
}
export function supplierInferenceControl(
  socket: WebSocket,
  harness: ComputerHarness,
  frame: SupplierInferenceControl,
  current: () => boolean,
): Promise<void> {
  if (frame.type === 'harness_subscription_inference_credit') {
    harness.inferenceCredit(frame.id, frame.sequence);
    return Promise.resolve();
  }
  if (frame.type === 'harness_subscription_inference_cancel') {
    harness.inferenceCancel(frame.id);
    return Promise.resolve();
  }
  return harness.inference(frame.id, frame.request, (result) =>
    sendResult(socket, frame, result, current),
  );
}
function sendResult(
  socket: WebSocket,
  frame: SupplierInferenceControl,
  result: SubscriptionInferenceResult,
  current: () => boolean,
): Promise<void> {
  if (!current() || socket.readyState !== WebSocket.OPEN)
    return Promise.reject(new NodeHarnessError('Authenticated supplier channel disconnected.'));
  const text = JSON.stringify(
    NODE_HARNESS_FRAME.parse({
      device_id: frame.device_id,
      generation: frame.generation,
      runtime_instance: frame.runtime_instance,
      type: 'harness_subscription_inference_result',
      id: frame.id,
      result,
    }),
  );
  if (Buffer.byteLength(text) > SUBSCRIPTION_INFERENCE_MAX_BYTES)
    return Promise.reject(
      new NodeHarnessError('Supplier model result exceeds its bounded frame size.'),
    );
  return new Promise((resolve, reject) => {
    socket.send(text, (error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
}
