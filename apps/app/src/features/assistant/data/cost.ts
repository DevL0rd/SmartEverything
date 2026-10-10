import type { Money } from '../../region';

export function pricePerMillionText(dollars: number | null, money: Money): string {
  if (dollars === null) {
    return '—';
  }
  return dollars === 0 ? 'Free' : money.dollars(dollars);
}

export function contextText(tokens: number | null): string | null {
  if (tokens === null) {
    return null;
  }
  return tokens >= 1_000_000
    ? `${String(Math.round(tokens / 100_000) / 10)}M context`
    : `${String(Math.round(tokens / 1000))}K context`;
}
