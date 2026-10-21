import type { ImageEndpoint } from '@smarteverything/domain';

type PriceLine = ImageEndpoint['pricing'][number];
type Dollars = (amount: number) => string;

const PER_MILLION_TOKENS = 1_000_000;
const OUTPUT = 'output_image';
const UNIT_ORDER: readonly string[] = ['image', 'megapixel', 'request', 'token'];

const BILLABLE_LABELS: Readonly<Record<string, string>> = {
  output_image: 'Image output',
  input_image: 'Image input',
  input_text: 'Text input',
  input_reference: 'Reference image',
  input_font: 'Font',
};

function amountText(line: PriceLine, dollars: Dollars): string {
  if (line.cost_usd === 0) return 'Free';
  if (line.unit === 'token') return `${dollars(line.cost_usd * PER_MILLION_TOKENS)} / 1M tokens`;
  return `${dollars(line.cost_usd)} / ${line.unit}`;
}

function unitRank(unit: string): number {
  const rank = UNIT_ORDER.indexOf(unit);
  return rank === -1 ? UNIT_ORDER.length : rank;
}

export function priceLine(endpoint: ImageEndpoint, dollars: Dollars): string | null {
  const outputs = endpoint.pricing.filter((line) => line.billable === OUTPUT);
  const best = outputs.reduce<string | null>(
    (unit, line) => (unit === null || unitRank(line.unit) < unitRank(unit) ? line.unit : unit),
    null,
  );
  if (best === null) return null;
  const same = outputs.filter((line) => line.unit === best);
  const lowest = same.reduce((a, b) => (b.cost_usd < a.cost_usd ? b : a));
  const varies = same.some((line) => line.cost_usd !== lowest.cost_usd);
  const text = amountText(lowest, dollars);
  return varies ? `from ${text}` : text;
}

export interface PriceDetail {
  readonly label: string;
  readonly text: string;
}

export function priceDetails(endpoint: ImageEndpoint, dollars: Dollars): readonly PriceDetail[] {
  return endpoint.pricing.map((line) => {
    const base = BILLABLE_LABELS[line.billable] ?? line.billable;
    return {
      label: typeof line['variant'] === 'string' ? `${base} · ${line['variant']}` : base,
      text: amountText(line, dollars),
    };
  });
}
