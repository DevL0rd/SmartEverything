import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AI_NATIVE_REFERENCE_RESULT,
  type AiReference,
  type AiNativeReferenceAction,
  type AiReferenceKind,
  type AiNativeReferenceResult,
} from '@smarteverything/domain';
import type { ReferenceContext, ReferenceRuntime } from '../references/contracts';
import type { HarnessService } from './service';
import { nativeReferenceSession, nativeReferenceRevision } from './reference-authority';
import { nativeReferenceSource } from './reference-source';

const NATIVE_KINDS: readonly AiReferenceKind[] = [
  'device_path',
  'skill',
  'plugin',
  'command',
  'agent',
];
export type NativeReferenceOperation = (
  context: ReferenceContext,
  input: AiNativeReferenceAction,
) => Promise<AiNativeReferenceResult>;
export function harnessReferenceRuntime(service: HarnessService): ReferenceRuntime {
  const execute: NativeReferenceOperation = (context, input) =>
    executeNativeReference(service, context, input);
  return {
    sources: NATIVE_KINDS.map((kind) => nativeReferenceSource(service, kind, execute)),
    revision: (context) => nativeReferenceRevision(service, context),
    admit: async (context, references): Promise<void> => {
      await execute(context, { action: 'resolve', references: [...references] });
    },
  };
}
async function executeNativeReference(
  service: HarnessService,
  context: ReferenceContext,
  input: AiNativeReferenceAction,
): Promise<AiNativeReferenceResult> {
  const state = nativeReferenceSession(service, context);
  if (state.epoch === null)
    throw new ApiError('conflict', 'Native reference writer epoch is absent.');
  const revision = nativeReferenceRevision(service, context);
  const id = randomUUID();
  const receipt = await service.directory.execute(state.target, id, {
    kind: 'reference',
    session_id: state.session_id,
    expected_epoch: state.epoch,
    input,
  });
  context.validate();
  nativeReferenceSession(service, context);
  if (
    nativeReferenceRevision(service, context) !== revision ||
    receipt.operation_id !== id ||
    receipt.session_id !== state.session_id ||
    receipt.epoch !== state.epoch ||
    receipt.state !== 'completed' ||
    receipt.references === undefined
  )
    throw new ApiError(
      'conflict',
      'Native reference receipt does not match its exact current authority.',
    );
  return AI_NATIVE_REFERENCE_RESULT.parse(receipt.references);
}
export async function resolveRuntimeReference(
  execute: NativeReferenceOperation,
  context: ReferenceContext,
  reference: AiReference,
): Promise<AiReference> {
  await execute(context, { action: 'resolve', references: [reference] });
  return reference;
}
