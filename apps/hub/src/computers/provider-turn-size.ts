import {
  ApiError,
  PROVIDER_TURN_MAX_BYTES,
  type ComputerRuntimeProviderTurn,
} from '@smarteverything/domain';

export function assertProviderTurnSize(turn: ComputerRuntimeProviderTurn['turn']): void {
  if (Buffer.byteLength(JSON.stringify(turn), 'utf8') > PROVIDER_TURN_MAX_BYTES)
    throw new ApiError(
      'invalid_request',
      'Runtime provider turn exceeds the 32 MiB transport limit.',
    );
}
