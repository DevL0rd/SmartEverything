export interface BleStatusInput {
  readonly configured: boolean;
  readonly blockedReason: string | null;
  readonly freshUntil: string | null;
}

export interface BleStatusText {
  readonly value: string;
  readonly detail: string | undefined;
}

export function bleStatusOf(
  status: BleStatusInput | undefined,
  error: Error | null,
  now: number,
): BleStatusText {
  if (error !== null) {
    return { value: 'Unavailable', detail: error.message };
  }
  if (status === undefined) {
    return { value: 'Reading…', detail: undefined };
  }
  if (!status.configured) {
    return { value: 'Off', detail: undefined };
  }
  if (status.blockedReason !== null) {
    return { value: 'Blocked', detail: status.blockedReason };
  }
  if (status.freshUntil !== null && Date.parse(status.freshUntil) <= now) {
    return { value: 'Cloud only', detail: 'No recent authenticated broadcast' };
  }
  return { value: 'Receiving', detail: 'Authenticated Bluetooth broadcasts received recently' };
}
