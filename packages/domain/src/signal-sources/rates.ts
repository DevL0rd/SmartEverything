export type SignalRateKeyPart = 'kind' | 'subject' | 'field';

export interface SignalRate {
  readonly perMinute: number;
  readonly burst: number;
  readonly per: readonly SignalRateKeyPart[];
}

export interface SignalRateLine extends SignalRate {
  readonly source: string;
  readonly kind?: string;
}

export const PLUGIN_SOURCE_PREFIX = 'plugin_';

export const PLUGIN_SIGNAL_RATE: SignalRate = {
  perMinute: 30,
  burst: 10,
  per: ['kind', 'subject'],
};

export const SIGNAL_RATES: readonly SignalRateLine[] = [
  { source: 'device', perMinute: 30, burst: 10, per: ['kind', 'subject', 'field'] },
  { source: 'event', perMinute: 30, burst: 10, per: ['kind', 'subject'] },
  { source: 'computer', perMinute: 10, burst: 10, per: ['kind', 'subject', 'field'] },
  { source: 'health', perMinute: 30, burst: 10, per: ['kind', 'subject', 'field'] },
  { source: 'weather', perMinute: 30, burst: 10, per: ['kind', 'subject', 'field'] },
  { source: 'assistant', perMinute: 60, burst: 20, per: ['kind', 'subject'] },
  { source: 'schedule', perMinute: 30, burst: 10, per: ['kind', 'subject'] },
  { source: 'automation_value', perMinute: 30, burst: 10, per: ['kind', 'subject', 'field'] },
  { source: 'automation_run', perMinute: 30, burst: 10, per: ['kind', 'subject'] },
  { source: 'automation_event', perMinute: 60, burst: 20, per: ['kind', 'field'] },
  { source: 'automation_timer', perMinute: 30, burst: 10, per: ['kind', 'field'] },
  { source: 'webhook', perMinute: 60, burst: 20, per: ['kind', 'field'] },
  { source: 'hub', perMinute: 12, burst: 6, per: ['kind', 'subject'] },
  { source: 'listening', kind: 'wake_heard', perMinute: 6, burst: 3, per: ['kind', 'subject'] },
  { source: 'listening', perMinute: 12, burst: 6, per: ['kind', 'subject'] },
  { source: 'call', perMinute: 10, burst: 5, per: ['kind', 'subject'] },
  { source: 'device', kind: 'command', perMinute: 60, burst: 20, per: ['kind', 'subject'] },
  { source: 'provider', perMinute: 6, burst: 3, per: ['kind', 'subject'] },
  {
    source: 'plugin_router',
    kind: 'person_arrived',
    perMinute: 6,
    burst: 3,
    per: ['kind', 'subject'],
  },
  {
    source: 'plugin_router',
    kind: 'person_left',
    perMinute: 6,
    burst: 3,
    per: ['kind', 'subject'],
  },
  { source: 'device', kind: 'online', perMinute: 6, burst: 3, per: ['kind', 'subject'] },
  { source: 'device', kind: 'lifecycle', perMinute: 20, burst: 10, per: ['kind', 'subject'] },
];

export function signalRateOf(
  source: string,
  kind: string,
  lines: readonly SignalRateLine[] = SIGNAL_RATES,
): SignalRateLine | null {
  const forSource = lines.filter((line) => line.source === source);
  const line =
    forSource.find((entry) => entry.kind === kind) ??
    forSource.find((entry) => entry.kind === undefined);
  if (line !== undefined) return line;
  return source.startsWith(PLUGIN_SOURCE_PREFIX) ? { source, ...PLUGIN_SIGNAL_RATE } : null;
}

export function signalRateKey(
  rate: SignalRateLine,
  signal: {
    readonly source: string;
    readonly kind: string;
    readonly subject: string | null;
    readonly field: string | null;
  },
): string {
  const parts = rate.per.map((part) => signal[part] ?? '');
  return [rate.source, rate.kind ?? '', ...parts].join('|');
}
