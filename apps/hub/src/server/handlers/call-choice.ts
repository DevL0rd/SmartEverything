import { ApiError, type CallRow } from '@smarteverything/domain';

export function chosenCall(mine: readonly Pick<CallRow, 'callId'>[], requested?: string): string {
  if (requested !== undefined) {
    if (!mine.some((candidate) => candidate.callId === requested)) {
      throw new ApiError('not_found', `There is no call ${requested} of yours running.`);
    }
    return requested;
  }
  const [only, ...others] = mine;
  if (only === undefined) throw new ApiError('not_found', 'There is no call of yours running.');
  if (others.length > 0) {
    throw new ApiError(
      'conflict',
      `${String(mine.length)} calls are running: pass callId, from outreach_read view calls.`,
    );
  }
  return only.callId;
}
