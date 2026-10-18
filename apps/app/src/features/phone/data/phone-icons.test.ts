import { describe, expect, it } from 'vitest';
import { iconUriOf, phoneIconKey } from './phone-icons';

const HASH = 'a'.repeat(64);

describe('phone icons', () => {
  it('turns the bytes the hub sends into an image address', () => {
    expect(iconUriOf({ hash: HASH, webpBase64: 'UklGRg==' })).toBe(
      'data:image/webp;base64,UklGRg==',
    );
  });

  it('keys an icon by its hash alone so every phone and page shares it', () => {
    expect(phoneIconKey(HASH)).toEqual(['phone-icon', HASH]);
  });
});
