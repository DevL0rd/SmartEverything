import type { AiNativeCommandReceipt, CodexProviderEvent } from '@smarteverything/domain';
export function codexCommandEvent(
  receipt: AiNativeCommandReceipt,
  event: CodexProviderEvent,
  compact = true,
): AiNativeCommandReceipt {
  if (!accepts(receipt, event)) return receipt;
  const observed = {
    ...receipt,
    source_event_seq: event.seq,
    turn_id: event.turn_id ?? receipt.turn_id,
  };
  if (completedCompaction(event, compact))
    return { ...observed, status: 'running', completed_item_id: event.item_id };
  if (event.kind === 'completed') return completed(observed, event.interrupted, compact);
  if (event.kind === 'failed') return failedCommand(observed, event);
  if (unknownNotice(event))
    return { ...observed, status: 'unknown', outcome: null, text: event.reason };
  return { ...observed, status: event.turn_id === null ? receipt.status : 'running' };
}
function accepts(receipt: AiNativeCommandReceipt, event: CodexProviderEvent): boolean {
  const scope = receipt.scope;
  const owner =
    event.job_id === receipt.command_job_id &&
    event.chat_id === scope.chat_id &&
    event.process_generation === scope.process_generation &&
    event.thread_id === scope.session_id;
  return owner && current(receipt, event);
}
function current(receipt: AiNativeCommandReceipt, event: CodexProviderEvent): boolean {
  if (!['pending', 'running'].includes(receipt.status)) return false;
  if (receipt.source_event_seq !== null && event.seq <= receipt.source_event_seq) return false;
  return receipt.turn_id === null || event.turn_id === null || receipt.turn_id === event.turn_id;
}
function completedCompaction(event: CodexProviderEvent, compact: boolean): boolean {
  return (
    compact &&
    event.kind === 'work_item' &&
    event.type === 'contextCompaction' &&
    event.payload['_phase'] === 'completed' &&
    event.turn_id !== null &&
    event.item_id !== null
  );
}
function completed(
  receipt: AiNativeCommandReceipt,
  interrupted: boolean,
  compact: boolean,
): AiNativeCommandReceipt {
  if (interrupted)
    return {
      ...receipt,
      status: 'settled',
      outcome: 'interrupted',
      text: compact ? 'Compaction was interrupted.' : 'Native skill invocation was interrupted.',
    };
  if (!compact) return { ...receipt, status: 'settled', outcome: 'completed', text: null };
  const compacted = receipt.completed_item_id !== null;
  return {
    ...receipt,
    status: 'settled',
    outcome: compacted ? 'compacted' : 'no_op',
    text: compacted
      ? 'Native context compaction completed.'
      : 'The native turn finished without completed compaction evidence.',
  };
}
function unknownFailure(code: string): boolean {
  return ['transport_lost', 'computer_disconnected'].includes(code);
}

function unknownNotice(
  event: CodexProviderEvent,
): event is Extract<CodexProviderEvent, { kind: 'lifecycle' }> {
  return event.kind === 'lifecycle' && event.state === 'unknown';
}

function failedCommand(
  receipt: AiNativeCommandReceipt,
  event: Extract<CodexProviderEvent, { kind: 'failed' }>,
): AiNativeCommandReceipt {
  const unknown = unknownFailure(event.code);
  return {
    ...receipt,
    status: unknown ? 'unknown' : 'settled',
    outcome: unknown ? null : 'error',
    text: event.message,
  };
}
