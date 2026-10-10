const MICROS_PER_DOLLAR = 1_000_000;

const formats = new Map<number, Intl.NumberFormat>();

function money(dollars: number, digits: number): string {
  let format = formats.get(digits);
  if (format === undefined) {
    format = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formats.set(digits, format);
  }
  return format.format(dollars);
}

export function costText(micros: number): string {
  const dollars = micros / MICROS_PER_DOLLAR;
  if (micros === 0) {
    return money(0, 2);
  }
  if (dollars < 0.001) {
    return `<${money(0.001, 3)}`;
  }
  return money(dollars, dollars < 0.01 ? 3 : 2);
}

export function pricePerMillionText(dollars: number | null): string {
  if (dollars === null) {
    return '—';
  }
  if (dollars === 0) {
    return 'Free';
  }
  if (dollars < 0.001) {
    return `<${money(0.001, 3)}`;
  }
  return money(dollars, dollars < 0.01 ? 3 : 2);
}

export function contextText(tokens: number | null): string | null {
  if (tokens === null) {
    return null;
  }
  return tokens >= 1_000_000
    ? `${String(Math.round(tokens / 100_000) / 10)}M context`
    : `${String(Math.round(tokens / 1000))}K context`;
}
