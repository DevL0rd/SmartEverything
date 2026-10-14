import { z } from 'zod';
import type { AiNativeCommandReceipt, ProviderEvent } from '@smarteverything/domain';
export function claudeCommandEvent(
  receipt: AiNativeCommandReceipt,
  event: ProviderEvent,
  compact: boolean,
): AiNativeCommandReceipt {
  if (!accepts(receipt, event)) return receipt;
  const observed = { ...receipt, source_event_seq: event.seq, status: 'running' as const };
  if (event.kind === 'runtime') return runtimeEvidence(observed, event, compact);
  if (event.kind === 'text')
    return { ...observed, text: ((receipt.text ?? '') + event.delta).slice(0, 200_000) };
  if (event.kind === 'failed') return failed(observed, event);
  if (event.kind === 'completed') return completed(observed, event, compact);
  return observed;
}
function accepts(receipt: AiNativeCommandReceipt, event: ProviderEvent): boolean {
  return (
    ['pending', 'running'].includes(receipt.status) &&
    event.job_id === receipt.command_job_id &&
    event.chat_id === receipt.scope.chat_id &&
    (receipt.source_event_seq === null || event.seq > receipt.source_event_seq)
  );
}
function failed(
  receipt: AiNativeCommandReceipt,
  event: Extract<ProviderEvent, { kind: 'failed' }>,
): AiNativeCommandReceipt {
  const unknown = ['provider_failed', 'computer_disconnected', 'transport_lost'].includes(
    event.code,
  );
  return {
    ...receipt,
    status: unknown ? 'unknown' : 'settled',
    outcome: unknown ? null : 'error',
    text: event.message,
  };
}
function completed(
  receipt: AiNativeCommandReceipt,
  event: Extract<ProviderEvent, { kind: 'completed' }>,
  compact: boolean,
): AiNativeCommandReceipt {
  if (event.session_id !== receipt.scope.session_id)
    return {
      ...receipt,
      status: 'unknown',
      outcome: null,
      text: 'The command returned another native session; its binding was not adopted.',
    };
  if (event.interrupted)
    return {
      ...receipt,
      status: 'settled',
      outcome: 'interrupted',
      text: receipt.text ?? 'Native command interrupted.',
    };
  if (compact && receipt.outcome === 'error') return { ...receipt, status: 'settled' };
  if (!compact)
    return {
      ...receipt,
      status: 'settled',
      outcome: 'completed',
      text: receipt.text ?? 'The owned native command turn completed.',
    };
  return completedCompaction(receipt);
}
function completedCompaction(receipt: AiNativeCommandReceipt): AiNativeCommandReceipt {
  const compacted = receipt.completed_item_id !== null;
  return {
    ...receipt,
    status: 'settled',
    outcome: compacted ? 'compacted' : 'no_op',
    text:
      receipt.text ??
      (compacted
        ? 'Native context compaction completed.'
        : 'The native command finished without completed compaction evidence.'),
  };
}
function runtimeEvidence(
  receipt: AiNativeCommandReceipt,
  event: Extract<ProviderEvent, { kind: 'runtime' }>,
  compact: boolean,
): AiNativeCommandReceipt {
  const payload = event.payload;
  if (!ownsSource(receipt, payload))
    return {
      ...receipt,
      status: 'unknown',
      outcome: null,
      text: 'Native command source ownership changed.',
    };
  if (!compact || payload['type'] !== 'system') return receipt;
  if (payload['subtype'] === 'status') return compactStatus(receipt, payload);
  if (payload['subtype'] !== 'compact_boundary' || receipt.outcome === 'error') return receipt;
  const boundary = z
    .object({ trigger: z.literal('manual'), pre_tokens: z.number().nonnegative() })
    .safeParse(payload['compact_metadata']);
  if (!boundary.success || typeof payload['uuid'] !== 'string') return receipt;
  return { ...receipt, completed_item_id: payload['uuid'] };
}
function compactStatus(
  receipt: AiNativeCommandReceipt,
  payload: Extract<ProviderEvent, { kind: 'runtime' }>['payload'],
): AiNativeCommandReceipt {
  if (payload['compact_result'] !== 'failed') return receipt;
  return {
    ...receipt,
    outcome: 'error',
    completed_item_id: null,
    text:
      typeof payload['compact_error'] === 'string'
        ? payload['compact_error']
        : 'The native runtime reported failed compaction.',
  };
}
function ownsSource(
  receipt: AiNativeCommandReceipt,
  payload: Extract<ProviderEvent, { kind: 'runtime' }>['payload'],
): boolean {
  return (
    payload['_source_generation'] === receipt.scope.process_generation &&
    payload['_source_cwd'] === receipt.scope.cwd &&
    payload['session_id'] === receipt.scope.session_id
  );
}
