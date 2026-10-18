const SPOKEN: Readonly<Record<string, string>> = {
  '%': 'percent',
  '°C': 'degrees',
  W: 'watts',
  GHz: 'gigahertz',
  rpm: 'revolutions per minute',
  'B/s': 'bytes per second',
  'kB/s': 'kilobytes per second',
  'MB/s': 'megabytes per second',
  'GB/s': 'gigabytes per second',
  'TB/s': 'terabytes per second',
  B: 'bytes',
  kB: 'kilobytes',
  MB: 'megabytes',
  GB: 'gigabytes',
  TB: 'terabytes',
};

export function spokenUnit(unit: string | undefined): string {
  if (unit === undefined) return '';
  return unit
    .split(' ')
    .map((word) => SPOKEN[word] ?? word)
    .join(' ');
}

export function spokenFact(label: string, value: string, unit: string | undefined): string {
  return [label, value, spokenUnit(unit)].filter((part) => part !== '').join(' ');
}
