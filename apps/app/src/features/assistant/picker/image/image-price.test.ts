import { IMAGE_ENDPOINT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { priceDetails, priceLine } from './image-price';

const dollars = (amount: number): string =>
  amount >= 1 ? `$${amount.toFixed(2)}` : `$${amount.toPrecision(2)}`;

function endpointOf(
  pricing: readonly Record<string, unknown>[],
): ReturnType<typeof IMAGE_ENDPOINT.parse> {
  return IMAGE_ENDPOINT.parse({
    model: 'maker/model',
    name: 'Model',
    provider_tag: 'maker',
    parameters: {},
    supports_streaming: false,
    pricing,
  });
}

describe('image price line', () => {
  it('shows a flat per-image price', () => {
    const endpoint = endpointOf([{ billable: 'output_image', unit: 'image', cost_usd: 0.04 }]);
    expect(priceLine(endpoint, dollars)).toBe('$0.040 / image');
  });

  it('says from when the tiers differ', () => {
    const endpoint = endpointOf([
      { billable: 'output_image', unit: 'image', cost_usd: 0.08, variant: '2k' },
      { billable: 'output_image', unit: 'image', cost_usd: 0.04, variant: '1k' },
    ]);
    expect(priceLine(endpoint, dollars)).toBe('from $0.040 / image');
  });

  it('shows token prices per million tokens, never as a rounded zero', () => {
    const endpoint = endpointOf([
      { billable: 'output_image', unit: 'token', cost_usd: 0.00003 },
      { billable: 'input_text', unit: 'token', cost_usd: 0.000005 },
    ]);
    expect(priceLine(endpoint, dollars)).toBe('$30.00 / 1M tokens');
  });

  it('shows megapixel prices in their own unit', () => {
    const endpoint = endpointOf([{ billable: 'output_image', unit: 'megapixel', cost_usd: 0.07 }]);
    expect(priceLine(endpoint, dollars)).toBe('$0.070 / megapixel');
  });

  it('shows free models as free and missing output prices as nothing', () => {
    expect(
      priceLine(endpointOf([{ billable: 'output_image', unit: 'image', cost_usd: 0 }]), dollars),
    ).toBe('Free');
    expect(
      priceLine(endpointOf([{ billable: 'input_image', unit: 'image', cost_usd: 0.1 }]), dollars),
    ).toBeNull();
    expect(priceLine(endpointOf([]), dollars)).toBeNull();
  });

  it('lists every billed line with its own unit', () => {
    const endpoint = endpointOf([
      { billable: 'input_text', unit: 'token', cost_usd: 0.000005 },
      { billable: 'output_image', unit: 'token', cost_usd: 0.00003 },
      { billable: 'input_image', unit: 'image', cost_usd: 0 },
    ]);
    expect(priceDetails(endpoint, dollars)).toEqual([
      { label: 'Text input', text: '$5.00 / 1M tokens' },
      { label: 'Image output', text: '$30.00 / 1M tokens' },
      { label: 'Image input', text: 'Free' },
    ]);
  });
});
