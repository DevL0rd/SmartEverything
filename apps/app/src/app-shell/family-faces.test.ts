import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../store/device-fixture';
import { renderFamilyFace } from './family-faces';

describe('family faces', () => {
  it('gives a computer its own face without anything else being imported first', () => {
    const device = deviceFixture(0, { kind: 'computer' });
    expect(renderFamilyFace('computer', device, 'm')).not.toBeNull();
  });

  it('gives a phone a face on the four wide frame classes and leaves the tile to the generic one', () => {
    const phone = deviceFixture(2, { kind: 'phone' });
    for (const cls of ['m', 'w', 'l', 'xl'] as const) {
      expect(renderFamilyFace('phone', phone, cls)).not.toBeNull();
    }
    expect(renderFamilyFace('phone', phone, 's')).toBeNull();
    expect(renderFamilyFace('phone', phone, 'xs')).toBeNull();
  });

  it('leaves every other family to the generic face', () => {
    expect(renderFamilyFace('light', deviceFixture(1, { kind: 'light' }), 'm')).toBeNull();
  });
});
