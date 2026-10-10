import { describe, expect, it } from 'vitest';
import { encode } from 'uqr';
import { appDeclaredVersion } from './app-manifest';
import { installedVersion } from './versions';

describe('uqr contract', () => {
  it('is installed at exactly the version the app declares', () => {
    expect(installedVersion('uqr')).toBe(appDeclaredVersion('uqr'));
  });

  it('encodes text into a square grid of dark modules with the quiet zone asked for', () => {
    const qr = encode('{"url":"https://home.example.com","code":"ABCD-EFGH"}', {
      ecc: 'M',
      border: 2,
    });
    expect(qr.data).toHaveLength(qr.size);
    expect(qr.data.every((row) => row.length === qr.size)).toBe(true);
    expect(qr.data[0]?.some((dark) => dark)).toBe(false);
    expect(qr.data[2]?.[2]).toBe(true);
    expect(qr.size).toBe(21 + 4 * (qr.version - 1) + 4);
  });
});
