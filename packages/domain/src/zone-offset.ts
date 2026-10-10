class ZoneOffsetError extends Error {
  override readonly name = 'ZoneOffsetError';

  constructor(timeZone: string, received: string) {
    super(`The offset of ${timeZone} could not be read; Intl gave ${received}.`);
  }
}

export function zoneOffsetSeconds(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  if (name === 'GMT') {
    return 0;
  }
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name ?? '');
  if (match === null) {
    throw new ZoneOffsetError(timeZone, name ?? 'nothing');
  }
  const seconds = Number(match[2]) * 3600 + Number(match[3]) * 60;
  return match[1] === '-' ? -seconds : seconds;
}
